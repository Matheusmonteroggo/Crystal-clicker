# Plano Gigante — Parte 3: A Era do Futuro + Otimização, UI, Gráficos e Correção de Bugs (Crystal Miner)

## Contexto e estado atual
O jogo é um único arquivo `crystal-miner-corrigido.html` (~3161 linhas), idle/clicker single-file (`Crystal Miner`). Já existem 2 eras (**presente** e **passado**) com viagem temporal `presente ↔ passado` via `canTimeTravel()`/`travelToPast()`/`travelToPresent()` (linhas 1833-1880). O estado é salvo por era (`presentState`/`pastState`) e globais (`lifetime*`, `temporalFragments`, `prestigePoints`, etc.).

Planos anteriores já aplicados/planejados:
- `1786890385121-crystal-miner-bugs-and-content-plan.md` — bugs (viagem no tempo, NaN, saves) + "milhares de pequenas coisas".
- `1786890385121-crystal-miner-balance-plan.md` — soft-cap/tanh em `getClickPower`/`getAutoPower` (linhas 1257-1315), `getTotalMultiplier` com `tanh` (1238-1253), `maxLevel` em upgrades de % (985-988), `softCapPercent` (1232).

**Objetivo deste plano:** adicionar a **Parte 3 — Era do Futuro** (3ª era sequencial), com gating específico (só após ir ao passado e cumprir tarefas lá), 20 itens gacha, 6 itens especiais/míticos, 22 upgrades, uma nova moeda **Fr (Fragmentos da Realidade)** própria do futuro, e uma mecânica única: a **Árvore de Realidade** (upgrades permanentes cross-era financiados por Fr). Além disso: **otimização**, **melhoria gráfica/UI**, **correção do bug do botão de som sobrepondo as moedas de gacha**, e **caça-correção de bugs**.

Decisões confirmadas com o usuário:
1. Futuro = **3ª era sequencial** (presente → passado → futuro), navegável.
2. Itens especiais/míticos e gacha do futuro obtidos por **mecânica única**; a moeda Fr alimenta a **Árvore de Realidade** (não é só moeda de prestígio).
3. Upgrades (22) e itens gacha (20) do futuro **reutilizam o padrão data-driven** (`UPGRADES_DEFS_FUTURE`/`ITEMS_DEFS_FUTURE`) e o `softCapPercent`/`getTotalMultiplier` existentes.

---

## Princípios (regras do jogo)
- **Sem tetos absolutos visíveis.** Reuso de `softCapPercent`/`tanh` (já calibrados) para o futuro.
- **Preservar saves antigos.** Nenhuma mudança de schema que quebre `loadState`/`isValidSaveShape`. Novos campos com `|| default`.
- **Conteúdo data-driven.** Tudo via arrays `ITEMS_DEFS_FUTURE`, `UPGRADES_DEFS_FUTURE`, `REALITY_TREE_DEFS`, `FUTURE_SPECIAL_DEFS`.
- **Gating claro.** Futuro exigível apenas após `era==='past'` ter cumprido tarefas específicas (ver Fase 1).

---

## FASE 1 — Modelo de 3 Eras + Gating do Futuro

### 1.1 Estado e viagem no tempo (extensão do modelo 2-era)
- `state.era` passa a aceitar `'future'`. `defaultState()` (1086) e `createEraState` (1055) ganham `futureState`.
- Novos helpers:
  - `getCurrentItemsDefs()` (1205): `era==='past' ? ITEMS_DEFS_PAST : era==='future' ? ITEMS_DEFS_FUTURE : ITEMS_DEFS`.
  - `getCurrentUpgradesDefs()` (1209): equivalente com `UPGRADES_DEFS_FUTURE`.
  - `getCurrentSpecialDefs()` novo: retorna `FUTURE_SPECIAL_DEFS` quando futuro (para `checkSpecialItems`/`checkHints`/`renderRumors`/`getProgressForItem`).
- `saveCurrentStateToEra(era)` (1882) e `loadStateFromEra(era)` (1916): adicionar branch `future`.
- `syncStateWithEra()` (1951): branch `future`.
- `isValidSaveShape` (2775) e `loadState` (2787): aceitar `futureState` e `era:'future'`.

### 1.2 Gating: como chegar ao futuro
Novo requisito em `canTimeTravel()` (1833). Atualmente retorna viagem ao passado. Adicionar:
- `canTravelToFuture()`: retorna `true` somente se **todas** estas condições:
  1. `state.era === 'past'` (só se chegou ao passado primeiro),
  2. **Tarefas específicas no passado cumpridas** (ver 1.3),
  3. `state.hasVisitedPast === true` (flag global setada em `travelToPast`).
- Em `state.era === 'future'`, `travelToPast`/`travelToPresent` mantêm navegação; `canTimeTravel()` para voltar ao presente do futuro retorna `true`.

### 1.3 Tarefas específicas no passado (precisam ser feitas LÁ)
Adicionar campo global `pastQuests` (objeto de flags) em `defaultState`. Tarefas (exibidas no Portal do Passado e/ou aba Rumores do passado):
- `Q1`: `prestigeCountPast >= 3` (já usado por `ancestral_wisdom`).
- `Q2`: possuir item mítico do passado (`ancestral_wisdom`) — `state.ownedSpecialItems.includes('ancestral_wisdom')`.
- `Q3`: acumular `lifetimeTotalCrystals >= 5.000.000` (já em `ancestral_wisdom`).
- `Q4`: completar todos os contratos diários do passado em ao menos 1 dia (flag `pastContractsMaster`).
- `Q5` (específica/nova): capturar `>= 10 Cristais Dourados enquanto estava no passado` (`pastGoldenCaught` contador — ver Bug/estado em 1.4).
Quando todas `true`, `canTravelToFuture()` libera e o Portal do Passado mostra botão "🚀 Viajar ao Futuro".

### 1.4 Contadores de era para gating
- Adicionar `pastGoldenCaught` (incrementado em `clickGoldenCrystal` quando `era==='past'`) e salvo em `saveCurrentStateToEra`.
- Adicionar `hasVisitedPast` (setado em `travelToPast`).
- `state.timeTravelCount` já existe (1098); manter.

### 1.5 `renderPortal()` (2471) — 3 modos
- `era==='past'`: mostra requisitos de **Q1–Q5** + botão "🚀 Viajar ao Futuro" (habilitado se `canTravelToFuture()`) e "🌐 Voltar ao Presente".
- `era==='future'`: mostra "🌀 Portal do Futuro", botão "🌐 Voltar ao Presente" e "⏳ Voltar ao Passado" (navegação livre uma vez lá).
- `era==='present'`: mantém tela atual de requisitos para o passado (inalterada).

### 1.6 Travel functions
- `travelToFuture()` (novo): guarda `saveCurrentStateToEra('past')`, `loadStateFromEra('future')`, `state.era='future'`, toasts, `renderAll()`, `scheduleGoldenCrystal()`.
- `travelToPast()` (1841) e `travelToPresent()` (1862): adicionar `state.era==='future'` como origem válida (já cobertas se passarmos a aceitar futuro como `era!=='present'` em alguns checks; revisar `canTimeTravel()` para não bloquear retorno do futuro).
- `needsRender*` em todos os 3 fluxos.

---

## FASE 2 — Conteúdo do Futuro (data-driven)

### 2.1 `ITEMS_DEFS_FUTURE` (20 itens gacha)
Adicionar array `ITEMS_DEFS_FUTURE` com **20 itens** `source:'gacha'` (mistura de `common`/`rare`/`epic`/`legendary`/`mythic`), seguindo o padrão de `ITEMS_DEFS` (913-952): cada item com `id,name,type('click'|'auto'),rarity,baseBonus,percentBonus?,icon,source`. Ex.: `neo_pick`, `fusion_core`, `chrono_blade`, `quantum_reactor`, etc. `type` e `percentBonus` fluem automaticamente em `getClickPower`/`getAutoPower` (1257/1287) via `getCurrentItemsDefs()`.

### 2.2 `UPGRADES_DEFS_FUTURE` (22 upgrades)
Adicionar **22 upgrades** seguindo `UPGRADES_DEFS` (972-989): `id,name,desc,baseCost,costMult,type,value|percent,icon,unlock(state)`, com `maxLevel` para os de `%` (reuso do padrão de `click_mastery` etc.). Custos exponenciais calibrados acima dos do passado (use `buildScaledUpgrades`-style se existir, senão manual). `unlock` baseado em `lifetime*`/`prestigeCount`/`realityFragments` (nova moeda) para gradualidade.

### 2.3 `FUTURE_SPECIAL_DEFS` (6 itens especiais/míticos)
6 itens `source:'special'|'mythic'` com `unlockCondition(state)`, `hints[]` (progressivos) e entram em `getProgressForItem`/`checkSpecialItems`/`checkHints`/`renderRumors`. Ex.:
- `temporal_crown` (mythic): requer `realityFragments >= X` + `ownedSpecialItems` de outras eras.
- `quantum_singularity`, `void_prism`, etc. (4-5 outros).
- `getProgressForItem` (1565) ganha branch para esses 6 ids (como já faz para `ancestral_wisdom` 1582).

### 2.4 Integração de itens/upgrades do futuro nos sistemas existentes
- `checkSpecialItems` (1452): loop em `getCurrentItemsDefs()` já cobre futuro se `FUTURE_SPECIAL_DEFS` estiver em `getCurrentItemsDefs()`. **Decisão:** manter especiais dentro de `ITEMS_DEFS_FUTURE` separados OU mesclar — recomendo array único `ITEMS_DEFS_FUTURE` contendo gacha + special/mythic (igual ao presente onde `ITEMS_DEFS` mistura). Assim `getCurrentItemsDefs()` retorna tudo do futuro e `checkSpecialItems`/`checkHints`/`renderRumors` funcionam sem branch extra.
- `getRandomItemByRarity` (1826) e `performGachaPull` (1809): filtram por `source==='gacha'` → futuro automático.
- `renderGacha` (2336) e `renderRumors` (2418): já usam `getCurrentItemsDefs()` → futuro automático.

---

## FASE 3 — Moeda Fr (Fragmentos da Realidade) + Árvore de Realidade

### 3.1 Obtenção de Fr: "Convergência Temporal" (mecânica única)
Nova função `checkConvergence()` (roda nos heavy checks ~1s, como `checkAchievements`):
- Define/metas simultâneas nas 3 eras. Ex.: `convergenceProgress = min(presentScore, pastScore, futureScore)` onde cada score é normalizado por marcos (cristais de vida, prestígios, Fr). Quando `>= 1`, concede **Fr** (ex.: `+1 Fr` por convergência, com cooldown diário ou por "ciclo").
- Alternativa complementar: **Anomalias do Futuro** — evento raro no futuro que dropa Fr (similar a `spawnGoldenCrystal` 2938, porém `spawnAnomaly()` com `state.anomalyActive`).
- Fr também pode vir de **prestígio do futuro** (`doPrestigeFuture`) como bônus secundário, mas o **núcleo** é a Convergência/Anomalia (decisão do usuário: "algo único e diferente").

### 3.2 `REALITY_TREE_DEFS` + Árvore de Realidade
Novo array `REALITY_TREE_DEFS` (permanente, cross-era, **não resetada por prestígio**):
- Cada nó: `id,name,desc,costFr,maxLevel,type('global_click'|'global_auto'|'global_multiplier'|'convergence_rate'|'offline'|...),value|percent,icon,unlock(state)`.
- Estado: `state.realityTree = { nodeId: level }` (global, em `defaultState`).
- `buyRealityNode(id)`: consome `state.realityFragments`, incrementa nível, respeita `maxLevel`.
- **Efeito cross-era:** os bônus da Árvore são aplicados **sempre** (presente/passado/futuro) em `getClickPower`/`getAutoPower`/`getTotalMultiplier`:
  - `global_click`/`global_auto`: somam ao `base` (antes do soft-cap).
  - `global_multiplier`: somam ao `rawBonus` de `getTotalMultiplier` (1238) — entra no `tanh`.
  - `convergence_rate`: aumenta taxa de Fr na Convergência.
  - `offline`: aumenta `OFFLINE_EFFICIENCY` (apenas quando ativo).
- Novo painel **Árvore de Realidade** (nova aba "🌳 Realidade" ou seção dentro do Portal do Futuro). Recomendo **nova aba** para clareza.

### 3.3 Header/HUD: exibir Fr
- Adicionar `stat-item reality` no `#header` (`stats-row`, 773-790) com ícone `💠` e `id="realityCount"`.
- `updateDisplay` (1980) atualiza `realityCountEl.textContent = formatNumber(state.realityFragments)`.
- `statsPanel` (844): linha "Fragmentos da Realidade".
- **Importante p/ bug do som (ver Fase 7):** o novo item Fr NÃO pode ficar sob o botão de som → ajuste de layout.

---

## FASE 4 — Otimização

### 4.1 Renderização
- **Lazy render das abas:** `renderUpgrades`/`renderGacha` já têm guard `needsRender*`. Estender: só renderizar aba ativa em `tab click` (já faz para contracts/rumors/portal). Garantir que `updateDisplay` não force re-render de listas grandes.
- **Virtualização leve:** se `UPGRADES_DEFS_FUTURE` (22) + presentes + passados ficarem grandes, paginar upgrades (ex.: 12 por "página" com botões). Mitigar travar DOM.
- **Cache de `formatNumber`** em `updateDisplay` já existe (`lastDisplayTexts` 1962) — manter e estender para Fr.
- `checkSpecialItems`/`checkHints`/`checkAchievements` já rodam 1x/s (gameLoop 2913) — ok. Adicionar `checkConvergence` no mesmo throttle.

### 4.2 Performance de loop
- `gameLoop` (2887) roda a 100ms. `getClickPower`/`getAutoPower` iteram `getCurrentUpgradesDefs()` + `equippedSlots` a cada chamada (várias vezes por tick via `updateDisplay`). **Otimização:** memoizar `clickPower`/`autoPower` calculados 1x por tick (guardar em variáveis `cachedClickPower`/`cachedAutoPower` recalculados só quando `needsRenderUpgrades`/`needsRenderInventory` ou estado muda). Evita N recomputações.
- Partículas: `MAX_PARTICLES=20` e `createParticles` já limita (2571). Manter; reduzir em `prefers-reduced-motion` (já faz).

### 4.3 Save
- `saveCurrentStateToEra` (1882) clona inventário/contratos a cada viagem — ok. `SAVE_INTERVAL=5000` (898) — manter.
- `isValidSaveShape` (2775): estender para validar tipos numéricos de `realityFragments`, `realityTree`, `futureState` (reuso da lógica de `presentState`).

---

## FASE 5 — Melhoria Gráfica e UI

### 5.1 Tema do Futuro
- Adicionar variáveis CSS de tema futuro (ex.: `--bg-future`, neon adicional) e classe `body.era-future` que troca gradientes/cores quando `state.era==='future'` (toggle em `travelToFuture`/`travelToPresent`/`travelToPast`).
- Cristal do futuro com skin diferente (ex.: `💠` ou efeito holográfico via `filter`).

### 5.2 Polish de UX (reuso do plano de conteúdo anterior)
- Badge "novo!" em abas (já existe para contracts; estender gacha/inventory/rumors/realidade).
- Tooltip em itens/upgrades mostrando bônus exato + multiplicador global.
- Indicador de "próximo ganho" de prestígio.
- Animações sutis em aquisição de item lendário/mítico (reuso de `.particle`/`.floating-text`).
- `prefers-reduced-motion` (já em 764) respeitado.

### 5.3 Acessibilidade
- `aria-live` no contador de Fr (igual `crystalCount` 776).
- Navegação por setas nas abas; manter `keydown` no crystal (3057).

---

## FASE 6 — Caça-Correção de Bugs (novos + remanescentes)

### 6.1 Bugs de gating/era
- **B-F1:** `canTimeTravel()` deve permitir retorno do futuro ao presente/passado sem exigir requisitos de ida. Revisar lógica para `era==='future'` retornar `true`.
- **B-F2:** `saveCurrentStateToEra`/`loadStateFromEra` perdem `pastGoldenCaught`/`pastQuests` se não salvos → adicionar aos clones.
- **B-F3:** `checkSpecialItems` no futuro pode tentar adicionar item com `inventory.length>=MAX_INVENTORY_SIZE` (20) e travar loop de toast → já tratado (1458), confirmar.
- **B-F4:** `getProgressForItem` retorna `null` para itens futuros não mapeados → `renderRumors` pula (`progress!==null` 2461) → adicionar branch futuro.

### 6.2 Bugs de moeda/estado
- **B-F5 (NaN):** `realityFragments` e nós da árvore devem ter coerção `Number.isFinite()||0` em `loadStateFromEra` (1916) e `getTotalMultiplier` (1238).
- **B-F6:** `applyOfflineProduction` (3031) não dispara `checkConvergence`/`checkSpecialItems` do futuro → chamar ao final (já chama checkSpecialItems/Hints/Achievements; adicionar checkConvergence).
- **B-F7:** import/export de save (`importSave` 3011) com `futureState` grande → validar shape antes de sobrescrever (reuso BUG FIX #5).

### 6.3 Bugs de UI/interação
- **B-F8 (CRÍTICO do usuário): botão de som sobrepondo moedas de gacha.** `sound-btn` é `position:absolute; top:10px; right:16px` (733-740) dentro do `#header` sticky. Em telas estreitas, sobrepõe o último `stat-item` (`gacha-coins`, 786). **Correção:** (a) mover `sound-btn` para fora da `stats-row` com `z-index` e `right` ajustados, ou (b) adicionar `padding-right` na `stats-row` / `gap` para reservar espaço, ou (c) posicionar o botão de som abaixo do header (fixo no canto) com `pointer-events` correto. Recomendo: tornar `#header` um grid com coluna reservada ao botão de som (não absoluto) OU colocar o botão de som com `position:absolute` mas garantir que `stats-row` tenha `padding-right: 48px` e o item Fr/gacha-coins não fiquem sob ele. Validar em viewport 360px.
- **B-F9:** `renderPortal` usa `innerHTML` com strings de conteúdo (2490-2520) — conteúdo é estático (sem input usuário), mas futuro deve usar `textContent`/templates seguros para evitar XSS acidental (reuso BUG FIX A9).
- **B-F10:** toasts de "milhares" de desbloqueios (conquistas/árvore) podem spammar → fila com limite + auto-dismiss (já existe `toastContainer` 689; agrupar).

---

## FASE 7 — Ordem de Implementação
1. **Fase 1** (3 eras + gating) — infraestrutura; sem isso nada do futuro funciona.
2. **Fase 3.1/3.2** (Fr + Árvore de Realidade + header) — moeda e mecânica única.
3. **Fase 2** (20 gacha + 22 upgrades + 6 especiais do futuro) — conteúdo data-driven.
4. **Fase 6** (bugs, inclusive B-F8 do som) — correções.
5. **Fase 4** (otimização) — memoização de power, lazy render.
6. **Fase 5** (UI/gráficos) — tema futuro, tooltips, badges.

---

## Riscos
- **Save incompatível:** novos campos (`futureState`, `realityFragments`, `realityTree`, `pastGoldenCaught`, `pastQuests`, `hasVisitedPast`) com defaults em `loadStateFromEra`/`defaultState` → save antigo carrega sem quebrar.
- **Balanceamento:** Fr/Árvore cross-era pode desequilibrar — usar `softCapPercent`/`tanh` e custos exponenciais de Fr; validar no `tools/balance-sim.js` existente (estender para futuro).
- **Performance:** 3 eras + árvore + mais itens → memoização (4.2) e lazy render (4.1) mitigam.
- **Complexidade de gating:** Q1–Q5 do passado devem ser visíveis/claros (Portal do Passado + Rumores) para o jogador não ficar perdido.

## Validação Final
- Servir HTML via `python3 -m http.server` em `/tmp`; abrir `crystal-miner-corrigido.html`.
- Fluxos: novo save → clicar → upgrades → gacha → prestígio presente → viajar ao passado → cumprir Q1–Q5 → viajar ao futuro → gacha/upgrades/especiais do futuro → Árvore de Realidade (gastar Fr) → voltar passado/presente (bônus cross-era persistem) → import/export → recarregar (offline + convergência).
- Console sem erros; `NaN`/`Infinity` ausentes em powers/multiplier/Fr.
- **B-F8:** em viewport 360px, botão de som NÃO sobrepõe gacha-coins nem Fr.
- `tools/balance-sim.js`: cenários presente/passado/futuro + árvore com Fr → produção monotônica, mult total < 1e6, sem NaN.

## Arquivos Afetados
- `crystal-miner-corrigido.html` — funções: `defaultState`, `createEraState`, `getCurrentItemsDefs`, `getCurrentUpgradesDefs`, `canTimeTravel`→`canTravelToFuture`, `travelToFuture`, `travelToPast`, `travelToPresent`, `saveCurrentStateToEra`, `loadStateFromEra`, `syncStateWithEra`, `isValidSaveShape`, `loadState`, `renderPortal`, `checkSpecialItems`, `checkHints`, `getProgressForItem`, `renderRumors`, `renderGacha`, `getClickPower`, `getAutoPower`, `getTotalMultiplier`, `updateDisplay`, `applyOfflineProduction`, `importSave`, `init`, `clickGoldenCrystal`; defs: novos `ITEMS_DEFS_FUTURE`, `UPGRADES_DEFS_FUTURE`, `REALITY_TREE_DEFS`, `FUTURE_SPECIAL_DEFS` (ou dentro de `ITEMS_DEFS_FUTURE`); estado: `futureState`, `realityFragments`, `realityTree`, `pastGoldenCaught`, `pastQuests`, `hasVisitedPast`; CSS: tema `.era-future`, correção `sound-btn`/header (B-F8); HTML: nova aba Realidade, `stat-item reality` no header, `realityCount`.
- `tools/balance-sim.js` — estender para futuro/Árvore de Realidade.
