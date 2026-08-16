# Plano Gigante de Balanceamento — Crystal Miner

## Contexto e problema central
O jogo (`crystal-miner-corrigido.html`, ~3300 linhas, single-file idle/clicker) tem um modelo de poder que **explode sem limite**:

1. **Stacking de % ilimitado.** Em `getClickPower`/`getAutoPower` (linhas ~1405/1435), os upgrades de percentual (`click_mastery` +10%/nível, `auto_efficiency` +8%/nível, `click_supremacy`/`auto_supremacy` +7%/nível) e itens equipados somam linearmente num pool `percent`. A compra de upgrades **não tem teto de nível** e o custo é limitado apenas a `Number.MAX_SAFE_INTEGER` (linha 1468). Um jogador rico compra níveis infinitos → 1000%+ de bônus trivialmente. É o bug de balanceamento que o usuário citou.
2. **Multiplicador global aditivo e ilimitado.** `getTotalMultiplier` (linha 1391) retorna `1 + levelBonus + prestigeBonus + temporalBonus + extra`, onde `prestigePoints` (com gain já capado em 1e6) e `temporalFragments` são ilimitados, e `extra` soma níveis de melhorias temporais também ilimitados.
3. `getLevel` (`1 + floor(sqrt(totalCrystals/1000))`) cresce devagar e é OK; o bônus de nível `(level-1)*0.03` é desprezível perto dos itens acima.
4. Os upgrades gerados por `buildScaledUpgrades` (linhas ~1055) são **base/value** (não %), então inflam a base plana, mas combinam com o multiplicador ilimitado no topo.

**Decisão do usuário (confirmada):** adotar **Caps suaves + retornos decrescentes** — manter upgrades compráveis por nível, mas (a) teto de nível por upgrade de %; (b) curva de retornos decrescentes no multiplicador total; (c) reescalar custos para acompanhar.

Objetivo: jogo que ainda "cresce para sempre" (sensação idle) mas com **potência que sobe em curva logarítmica/suave e nunca quebra o `Number`/DOM**, e onde cada sistema (clique, auto, prestígio, temporal, gacha, offline) permaneça relevante em todas as fases.

---

## Princípios de balanceamento (regras do jogo)
- **Sem tetos absolutos visíveis que "travam" o jogador.** Usar funções suaves (log/sqrt/tanh) que aproximam de um limite mas continuam subindo devagar.
- **Custo sempre > produção marginal.** Curva de custo deve crescer pelo menos tão rápido quanto a produção do próprio upgrade, senão o jogo "acaba".
- **Multiplicadores em camadas multiplicam entre si, mas cada camada tem retorno decrescente.** Ex.: `(1 + clickPercentRaw)` vira `(1 + softCap(clickPercentRaw))` onde `softCap(x)=K*tanh(x/K)`.
- **Coesão entre eras.** Presente e passado usam as mesmas funções de balanceamento (`getCurrentUpgradesDefs` já abstrai); mudar as funções core cobre ambos.
- **Preservar saves.** Nenhuma mudança de schema de save. Apenas nova lógica de cálculo (determinística a partir do estado existente).

---

## Fase 1 — Teto de nível em upgrades de percentual (anti-stacking)
### 1.1 Adicionar `maxLevel` às definições de upgrades
- No array `UPGRADES_DEFS`/`UPGRADES_DEFS_PAST`, adicionar campo `maxLevel` (default `Number.MAX_SAFE_INTEGER` ou 1000 para upgrades `value`, e **25 para upgrades `percent`**). Upgrades gerados (`buildScaledUpgrades`) recebem `maxLevel: 1000` (são value-based; 1000 níveis já é custo-proibitivo via 1.2).
- Upgrades de % manuais (`click_mastery`, `click_supremacy`, `auto_efficiency`, `auto_supremacy`, e equivalentes do passado `past_click_mastery`, `past_auto_efficiency`): `maxLevel: 25`.
- **Critério:** com +10%/nível e teto 25 → máx ~250% bruto por upgrade; com os 4 manuais ~+70% base somado etc. Depois passa pelo soft-cap da Fase 2, ficando bem comportado.

### 1.2 `buyUpgrade` respeita `maxLevel`
- Em `buyUpgrade` (linha ~1623), logo após `if (state.crystals < cost) return;`, inserir:
  ```js
  if (def.maxLevel !== undefined && (state.upgrades[id] || 0) >= def.maxLevel) {
      showToast('🔒', `${def.name} já está no nível máximo (${def.maxLevel}).`);
      return;
  }
  ```
- Em `renderUpgrades`/`updateUpgradesAffordability`, mostrar "MÁX" quando no teto (em vez de custo), para UX clara.

### 1.3 Soft-cap do pool de percentual (retorno decrescente no %)
- Criar `function softCapPercent(x) { const K = 5; return K * Math.tanh(x / K); }` (K=5 significa que 500% crus viram ~500% ainda, mas 5000% crus viram ~500% efetivos — curva suave).
- Em `getClickPower`/`getAutoPower`, trocar `const total = base * (1 + percent);` por:
  ```js
  const effPercent = softCapPercent(percent);
  const total = base * (1 + effPercent);
  ```
- Isso garante que mesmo % brutos altos convirjam, sem travar o jogador (tanh é contínua e sempre sobe).

---

## Fase 2 — Multiplicador global com retornos decrescentes
### 2.1 Reescrever `getTotalMultiplier` (linha 1391)
Atual: `(1 + levelBonus + prestigeBonus + temporalBonus + extra)` — aditivo, ilimitado.
Novo modelo em camadas (cada camada suave):
```js
function getTotalMultiplier() {
    const levelBonus = getLevelBonus(getLevel(state.totalCrystals));      // pequeno, ~<=0.5
    const prestigeBonus = getPrestigeBonus(state.prestigePoints);        // soma de pontos
    const temporalBonus = getTemporalFragmentBonus();                    // soma de fragmentos
    let extraBonus = 0;
    if (state.temporalUpgrades) {
        if (state.temporalUpgrades.temp_prod_both) extraBonus += state.temporalUpgrades.temp_prod_both * 0.10;
        if (state.temporalUpgrades.temp_click_both) extraBonus += state.temporalUpgrades.temp_click_both * 0.15;
    }
    // Soma bruta de todos os bônus aditivos:
    const rawBonus = levelBonus + prestigeBonus + temporalBonus + extraBonus;
    // Retorno decrescente: aproxima de um teto macio (ex.: 1000 => 100.000% efetivo máx de camada)
    const SOFT_CAP = 1000;
    const effBonus = SOFT_CAP * Math.tanh(rawBonus / SOFT_CAP);
    return (1 + effBonus);
}
```
- Efeito: `rawBonus` de 1000 → `effBonus≈1000` (100.000% de mult, ou x1001). `rawBonus` de 10000 → `effBonus≈1000` também (não explode). Curva suave, sem teto duro visível.
- `getPrestigeBonus` (`prestigePoints * 0.15`) e `getTemporalFragmentBonus` (`temporalFragments * 0.10`) permanecem; agora entram no tanh.

### 2.2 Rebalancear `PRESTIGE_BONUS_PER_POINT` e `TEMPORAL_FRAGMENT_BONUS`
- Com o tanh, valores crus podem ser maiores sem medo. Manter `PRESTIGE_BONUS_PER_POINT = 0.15` (cada ponto = +15% cru) e `TEMPORAL_FRAGMENT_BONUS = 0.10`. O tanh absorve. **Não mexer nos ganhos de prestígio (já capados em 1e6 em `getPrestigeGain`)** — apenas no bônus por ponto se necessário após simulação (ver Fase 6).

### 2.3 Bônus de nível mais significativo (opcional, baixo risco)
- `getLevelBonus(level) = (level-1)*0.03` é desprezível. Subir para `0.05` ou usar curva `0.02*level` para que nível importe mais no early/mid game. **Decisão:** `0.05` (2x). Validar no simulador.

---

## Fase 3 — Custos e curva de progressão
### 3.1 Curva de custo por nível
- `getUpgradeCost` (linha 1465): manter `baseCost * costMult^level` mas **garantir que `costMult` de upgrades de % seja mais íngreme** para que 25 níveis custem caro mas factível. Atualizar nos defs manuais de %: `costMult` de ~1.60–1.72 → **1.85–2.0** (ex.: `click_mastery` 1.90). Upgrades `value` mantêm ~1.30–1.72.
- Para upgrades gerados, `buildScaledUpgrades` já usa `costMult + i*0.01`; manter, talvez `i*0.012` para acelerar levemente. Validar custo × produção no simulador.

### 3.2 "Custo dinâmico" opcional (só se simulação mostrar idle "acabando")
- Se um upgrade ficar trivialmente barato vs produção, aplicar fator de escala por era: `cost *= (1 + 0.05 * state.prestigeCount)`. **Fora de escopo inicial**; registrar como ajuste pós-simulação.

---

## Fase 4 — Prestígio e Fragmentos Temporais
### 4.1 `getPrestigeGain` / `getPrestigeGainPast` (linhas 1472/1478)
- Já capados em `1e6`. Manter exponentes (`0.7` presente, `0.6*1.5` passado). Com o tanh na Fase 2, o ganho em *pontos* pode até subir (ex.: teto 1e6 → 5e6) porque o bônus por ponto agora é suave. **Decisão:** subir teto para `5e6` e reavaliar no simulador para que prestígio siga relevante late-game.
- Garantir que `doPrestige`/`doPrestigePast` continuem resetando apenas os campos de era (já corrigido em plano anterior).

### 4.2 Fragmentos Temporais (`temporalFragments`)
- Ganho em `doPrestigePast` (`gain = getPrestigeGainPast()`). Com teto maior, fragmentos sobem devagar mas contínuo → entra no tanh. Sem mudança de fórmula, só do teto em 4.1.

---

## Fase 5 — Gacha, Pity e Itens (anti-power-creep do equipamento)
### 5.1 Pity e raridade
- `performGachaPull` (linha ~1764): `GACHA_PITY_LIMIT = 80` (epic no pity). Manter, mas tornar o **pity progressivo**: a cada pull sem epic/legendary, `pityCounter++`; no limite garante epic. Já faz isso. **Ajuste:** reduzir chance de legendary (`0.5%`) para `0.3%` e epic `5.5%`→`4%` para que itens lendários continuem especiais mesmo com muito gacha (anti-inflation de itens equipados).
- `MAX_EQUIPPED = 2` (linha 905): **manter 2**. É o principalfreio de itens (só 2 slots). Sem mudança — já é o cap natural.

### 5.2 Itens equipados e percentBonus
- `getClickPower`/`getAutoPower` somam `def.percentBonus` de itens equipados no mesmo pool `percent` → agora passa pelo `softCapPercent` (Fase 1.3). Então equipar 2 itens lendários (+12% cada) é equilibrado e não stacka para o infinito. **Sem mudança de defs**, só herda o soft-cap.

### 5.3 `getSellValue` e economia de Gacha Coins
- Manter (1/5/15/40/80). Com menos lendários dropping, moedas ficam mais valiosas → equilibra "vender tudo" (já implementado).

---

## Fase 6 — Simulador de balanceamento (validação obrigatória)
Criar `tools/balance-sim.js` (Node, sem DOM) que:
1. Extrai as funções core do `<script>` (ou reimplementa `getClickPower`/`getAutoPower`/`getTotalMultiplier`/`getUpgradeCost`/`getPrestigeGain` com os novos parâmetros) usando os mesmos `UPGRADES_DEFS`/estado.
2. Roda cenários:
   - **Early** (1e3 cristais, 0 prestígio): clique ~1–10, auto 0–5.
   - **Mid** (1e9 cristais, 10 prestígio, 50 upgrades de % comprados): verificar que `percent` bruto alto é comprimido pelo tanh; mult total < ~1e4.
   - **Late** (1e15 cristais, 1000 prestígio, todos % no maxLevel 25, 5e6 fragmentos): verificar mult total converge (<~1e5), sem `NaN`/`Infinity`.
   - **Stress:** compra 1e6 níveis de `click_mastery` (se `maxLevel` não impedir no teste) → `softCapPercent` e tanh devem manter finito.
3. Imprime tabela: nível, custo do próximo upgrade, cps, clique, mult total, tempo para próximo "marco" (10x produção).
4. Critério de passagem: produção cresce monotônica, custo > produção marginal em cada marco, nenhum valor `NaN`/`Infinity`, mult total sempre `< 1e6` mesmo em late extreme.

---

## Fase 7 — Offline e misc
### 7.1 `applyOfflineProduction` (linha ~2958)
- `OFFLINE_EFFICIENCY = 0.5`, `OFFLINE_MAX_HOURS = 8`. Com mult suave, offline não quebra. **Ajuste:** reduzir `OFFLINE_MAX_HOURS` para **4** e `OFFLINE_EFFICIENCY` para **0.4** para evitar que voltar depois de dias pule o late-game. Validar no simulador.
### 7.2 `formatNumber` (já estendido para Aa/Ab/ciência) — sem mudança; aguenta os novos magnitudes.

---

## Ordem de implementação
1. Fase 1 (maxLevel + buyUpgrade + softCapPercent + getClick/AutoPower) — **maior impacto, faz o jogo não quebrar**.
2. Fase 2 (getTotalMultiplier com tanh + bônus de nível) — **segundo maior impacto**.
3. Fase 3 (costMult dos % manuais + buildScaledUpgrades).
4. Fase 4 (tetos de prestígio/fragmentos).
5. Fase 5 (gacha rates).
6. Fase 6 (simulador) — **executar e ajustar constantes (K do tanh, SOFT_CAP, maxLevel, costMult) até passar**.
7. Fase 7 (offline).

## Riscos
- **Quebra de sensação de progresso:** tanh muito agressivo deixa late-game "chato". Mitigação: K/SOFT_CAP calibrados no simulador; manter multiplicadores still-growing (só desacelerando).
- **Saves antigos com % alto:** estado salvo tem `upgrades[id]` alto (sem maxLevel antes). Ao carregar, `buyUpgrade` impedirá *novas* compras acima de `maxLevel`, mas níveis já existentes acima do novo teto permanecem — e o `softCapPercent` comprime o efeito. Aceitável; opcionalmente clampar `state.upgrades[id] = min(state.upgrades[id], maxLevel)` em `loadState`/`ensureUpgrades` para consistência.
- **Performance:** nenhuma mudança de loop; só funções puras. Sem risco.

## Validação final
- Rodar `tools/balance-sim.js` (Fase 6) — todos os cenários passam.
- Servir HTML, novo save, clique/auto/prestígio/gacha/tempo, recarregar; confirmar no console que mult total e produção são finitos e razoáveis, e que upgrades de % mostram "MÁX" no teto.
- Comparar save antigo (pré-balance) carregado: sem `NaN`, bônus comprimido pelo soft-cap.

## Arquivos afetados
- `crystal-miner-corrigido.html` (funções: `getClickPower`, `getAutoPower`, `getTotalMultiplier`, `getLevelBonus`, `buyUpgrade`, `getUpgradeCost`, `getPrestigeGain`, `getPrestigeGainPast`, `applyOfflineProduction`, `performGachaPull`; defs: `UPGRADES_DEFS`, `UPGRADES_DEFS_PAST`, `TEMPORAL_UPGRADES_DEFS`, constantes `PRESTIGE_BONUS_PER_POINT`, `TEMPORAL_FRAGMENT_BONUS`, `OFFLINE_*`, `GACHA_*`; novo helper `softCapPercent`, novo campo `maxLevel`).
- Novo: `tools/balance-sim.js` (validação, não shipado no jogo).
