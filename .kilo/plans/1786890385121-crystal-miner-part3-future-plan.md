# Plano Gigante — Parte 3: A Era do Futuro (Crystal Miner)

## Contexto e objetivo
O jogo (`crystal-miner-corrigido.html`, ~3161 linhas, single-file idle/clicker) tem 2 eras: `present` e `past`, com snapshots `presentState`/`pastState`. O usuário quer a **Parte 3**: uma 3ª era, o **Futuro**, que só é alcançável após ir ao passado e concluir uma **cadeia ordenada de 7 tarefas específicas no passado**. O Futuro introduz:
- Nova moeda **Fragmentos da Realidade (Fr)**, própria do futuro.
- **20 itens de gacha + 6 itens especiais/míticos** do futuro (26 itens `ITEMS_DEFS_FUTURE`).
- **22 upgrades do futuro** (`UPGRADES_DEFS_FUTURE`), com `maxLevel` e custos balanceados (reuso do padrão de balanceamento já implementado: `softCapPercent`, `getTotalMultiplier` com tanh).
- Mecânica única **Ascensão Cósmica** (bônus global permanente paga em Fr), análoga a Prestígio/Temporal.

Além disso: (a) **corrigir o bug do botão de som** sobrepondo as moedas de gacha no header; (b) **melhorar gráficos/UI** (tema futurista, animações, layout responsivo); (c) **otimizar** (lazy tabs + throttle de DOM, aproveitando pooling já existente); (d) **caçar e corrigir bugs** no jogo todo.

Decisões confirmadas com o usuário:
- **Gating futuro** = cadeia ordenada de 7 passos no passado (ver Fase 2), rastreada em `state.futureQuestStep`.
- **Fr** = exclusiva do futuro; ganha via Prestígio da Realidade + ações especiais; gasta em 22 upgrades do futuro + Ascensão Cósmica; **não** conversível.
- **Upgrades do futuro = 22** (`UPGRADES_DEFS_FUTURE`).
- **Otimização** = lazy tabs + throttle (sem virtualização pesada).

---

## Fase 0 — Preparação de estado e carregamento (save-compat)
### 0.1 Adicionar `futureState` ao estado
- Em `defaultState()` (linha ~1086): adicionar `futureState: createEraState(false)` e `era: 'present'` (já existe).
- `createEraState(isPast)` → generalizar para `createEraState(era)` onde `era ∈ {present, past, future}`; usar `era === 'future' ? UPGRADES_DEFS_FUTURE : era === 'past' ? UPGRADES_DEFS_PAST : UPGRADES_DEFS`. Adicionar campo `realityFragments: 0` (moeda Fr, por era como as outras, mas Fr só existe no futuro) e `cosmicAscensions: 0` (contador de Ascensões).
- `state.futureQuestStep` (global, não por era): 0 = bloqueado, 1..7 = passos, 8 = futuro desbloqueado. Persistir em `defaultState` e no save/load (root, igual a `timeTravelCount`).
- `state.realityFragments` global? **Decisão:** Fr é moeda do futuro, ficar em `futureState.realityFragments` (igual `gachaCoins` fica em cada eraState). `cosmicAscensions` também em `futureState` (resetado no Prestígio da Realidade, igual `prestigeCount` na era).

### 0.2 `loadState` / `saveCurrentStateToEra` / `loadStateFromEra`
- `saveCurrentStateToEra(era)` (linha ~1905): adicionar branch `if (era === 'future') state.futureState = eraState;` e copiar os novos campos (`realityFragments`, `cosmicAscensions`, `lifetimeGoldenCrystalsCaught`).
- `loadStateFromEra`: adicionar caso `future` (clonar de `state.futureState`).
- `syncStateWithEra()` (linha ~1948): adicionar `else if (state.era === 'future')` carregando `futureState`.
- `isValidSaveShape` (linha ~2762): permitir `futureState` opcional (merge cria default se ausente → **save antigo continua válido**).
- `loadState` merge: inicializar `futureState: createEraState(false)` e `futureQuestStep: parsed.futureQuestStep || 0`.

### 0.3 `getCurrentItemsDefs`/`getCurrentUpgradesDefs`
- `getCurrentItemsDefs()` (linha ~1206): `return state.era === 'past' ? ITEMS_DEFS_PAST : state.era === 'future' ? ITEMS_DEFS_FUTURE : ITEMS_DEFS;`
- `getCurrentUpgradesDefs()` (linha ~1210): igual, com `UPGRADES_DEFS_FUTURE`.

---

## Fase 1 — Conteúdo do Futuro (datasets)
### 1.1 `ITEMS_DEFS_FUTURE` (26 itens)
- **20 gacha** (`source:'gacha'`): distribuir por raridade — ex.: 8 common, 5 rare, 4 epic, 3 legendary (com `baseBonus`/`percentBonus` crescentes, ícones futuristas: 🛸⚡🔮💠🌐🛰️🤖). Seguir padrão de `ITEMS_DEFS`.
- **6 especiais/míticos** (`source:'special'`/`'mythic'`) com `unlockCondition` e `hints` (já há infra em `checkSpecialItems`/`getProgressForItem`/`checkHints`). Ex.: `quantum_core` (mítico), `time_loom`, `singularity_blade`, `aurora_engine`, `void_crown`, `genesis_heart` (mítico final). `unlockCondition` usa flags do futuro (ex.: `s.cosmicAscensions >= 1`, `s.realityFragments >= X`, `s.lifetimeTotalCrystals >= Y`).
- `checkSpecialItems` já itera `getCurrentItemsDefs()` e respeita `ownedSpecialItems` (não re-obtém). Funciona para futuro sem mudança.

### 1.2 `UPGRADES_DEFS_FUTURE` (22 upgrades)
- 11 `click` + 11 `auto` (ou mix), com `value` base e alguns `percent` (estes com `maxLevel: 25`, igual ao padrão de balanceamento atual). `unlock` baseado em `s.lifetimeTotalCrystals`/`s.cosmicAscensions` do futuro.
- Custos `baseCost`/`costMult` na faixa alta (futuro é late-game): ex. `costMult` 1.6–2.0, `baseCost` 1e12–1e18. Aplicar `maxLevel` nos de `%`.
- `ensureUpgrades` (linha ~2890) já itera `defs` por era — adicionar `UPGRADES_DEFS_FUTURE` no merge de `futureState`.

### 1.3 Novas constantes
- `const REALITY_FRAGMENT_BONUS = 0.05;` (Fr → +5% global por fragmento, análogo a `TEMPORAL_FRAGMENT_BONUS`).
- `const COSMIC_ASCENSION_BONUS = 0.20;` (Ascensão → +20% global por nível, análogo a `PRESTIGE_BONUS_PER_POINT`).
- `getRealityFragmentBonus()` e `getCosmicAscensionBonus()`; somar em `getTotalMultiplier` (já em camadas suaves via tanh — Fr/Ascensão entram no `rawBonus`).

---

## Fase 2 — Gating: cadeia ordenada de 7 passos no PASSADO
### 2.1 `state.futureQuestStep` (0..8)
- Rastreado em root `state`. Steps:
  1. `prestigeCountPast >= 1`
  2. `pastState.totalCrystals` (ou lifetime no passado) `>= 1e9`
  3. `pastState.totalUpgrades >= 10`
  4. possuir `ancestral_wisdom` (mítico do passado) — checar `state.inventory.some(i => i.itemId === 'ancestral_wisdom')`
  5. `prestigeCountPast >= 3`
  6. `temporalFragments >= 50`
  7. `equippedSlots.filter(Boolean).length === 2` (2 itens do passado equipados)
  - Ao concluir 7 → `futureQuestStep = 8` (futuro liberado).
- Função `checkFutureQuest()` (chamada no gameLoop pesado / após ações no passado): avalia o step atual; se cumprido, incrementa `futureQuestStep` e mostra NPC (`showNPCDialog`) com o próximo objetivo. Não pode pular passos (ordenado).
- **Importante:** os checks usam estado do **passado** (`pastState.*`), então só progridem enquanto `state.era === 'past'`. Se o jogador volta ao presente, o progresso (em `state.futureQuestStep`) é preservado em root.

### 2.2 `canTravelToFuture()`
```js
function canTravelToFuture() {
    if (state.era === 'future') return true;
    return state.era === 'past' && state.futureQuestStep >= 8 || (state.era === 'present' && state.futureQuestStep >= 8);
}
```
Na prática: futuro só acessível após 7 passos no passado → `futureQuestStep >= 8`. (Pode-se permitir ir do presente direto se já desbloqueado, sem obrigar re-passar pelo passado.)

### 2.3 `travelToFuture()` / `travelToPresent()` (do futuro)
- `travelToFuture()`: `if (state.era !== 'past' || !canTravelToFuture()) return;` → salvar passado, carregar futuro, `state.era='future'`, toasts, `renderAll()`, `scheduleGoldenCrystal()`.
- `travelToPresent()` existente já aceita `state.era === 'past'`; generalizar para `if (state.era !== 'past' && state.era !== 'future') return;`. Ao voltar do futuro, `state.era='present'`.
- `renderPortal()` (linha ~2471): adicionar branch `state.era === 'future'` (botão "Voltar ao Presente" + painel de Ascensão) e, no presente, mostrar a **cadeia de 7 passos** como checklist progressivo (reuso do `reqs` HTML atual, porém lendo `futureQuestStep`).

---

## Fase 3 — Mecânica do Futuro: Fr, Prestígio da Realidade, Ascensão
### 3.1 Ganho de Fr
- `getRealityGain()`:类似 `getPrestigeGain` mas usa `futureState.totalCrystals`; exponente 0.65; cap 5e6.
- `doRealityPrestige()`: zera `futureState` (crystals/totalCrystals/upgrades/autoAccumulator), `futureState.cosmicAscensions += 1`, `futureState.realityFragments += gain`, toasts, som com `playPrestigeSound()`, `checkSpecialItems()` etc.

### 3.2 Ascensão Cósmica (gasto de Fr)
- `renderPrestige()` (linha ~2170): quando `state.era === 'future'`, mostrar painel "Ascensão Cósmica" com botão que consome Fr por nível (custo `baseCost * costMult^nível`) e aplica `getCosmicAscensionBonus()` no multiplicador global. `buyCosmicAscension(id)`.
- `TEMPORAL_UPGRADES_DEFS` do futuro (opcional): 2–3 melhorias pagas em Fr (ex.: +Fr por Ascensão, +chance golden no futuro).

### 3.3 Integração no multiplicador
- `getTotalMultiplier()`: adicionar `const realityBonus = getRealityFragmentBonus(); const ascensionBonus = getCosmicAscensionBonus();` e somá-los ao `rawBonus` antes do tanh. Assim Fr e Ascensão seguem o mesmo retorno decrescente já balanceado.

---

## Fase 4 — Corrigir bug do botão de som (UI)
### 4.1 Causa
`.sound-btn` (linha ~733): `position:absolute; top:10px; right:16px; z-index:101` dentro do sticky `#header`, sobrepondo o `.stat-item.gacha-coins` (🪙) em `.stats-row` em telas estreitas.
### 4.2 Fixo
- Remover `position:absolute`. Colocar o botão **dentro do fluxo** do header: adicionar ao `.stats-row` como último item (ou criar um container flex `header-top` com stats à esquerda e botão à direita). Garantir `flex-wrap` e `gap` para não sobrepor em mobile. Manter `aria-label`.
- Testar em larguras 320px / 768px / desktop: gacha-coins visível e clicável, botão não cobre nada.

---

## Fase 5 — Melhorar gráficos / UI (tema futurista + responsividade)
- **Tema por era:** quando `state.era === 'future'`, aplicar classe `era-future` no `<body>` que troca acentos (ciano/magenta → roxo/neon), gradiente de fundo e brilho dos cards (CSS variações). Reuso de `--accent-*`.
- **Animações:** partículas do futuro com ícones 🛸/⚡; crystalline shine mantido. Respeitar `prefers-reduced-motion` (já implementado).
- **Portal futurista:** ícone 🌌/🛸 no botão de viagem; barra de progresso da cadeia de 7 passos.
- **Responsividade:** revisar breakpoints (já há `@media (min-width:480px)`); garantir header/tabs empilham sem sobreposição; botão de som na Fase 4.
- **Acessibilidade:** manter `aria-live`, `aria-label`, foco visível; adicionar `aria-current` na aba ativa.

---

## Fase 6 — Otimização (lazy tabs + throttle)
### 6.1 Lazy rendering
- `renderAll()` (linha ~2455) hoje renderiza todas as abas. Mudar para **só renderizar a aba ativa** + marcar `needsRender*` das outras para renderizar no primeiro acesso. No handler de troca de aba (`init`, linha ~2937), chamar `renderTab(tab)` que faz `renderUpgrades()`/`renderInventory()`/etc. conforme `tab.dataset.tab`, e setar `needsRenderX = false`.
- Mantér `gameLoop` chamando os `if (needsRenderX) renderX();` — mas só a aba visível precisa ser atualizada a cada tick. Adicionar `isTabVisible(tab)` e pular render de abas ocultas no loop (economiza DOM).
### 6.2 Throttle de affordability
- `updateUpgradesAffordability()` roda a cada 100ms sobre **todas** as cards. Limitar: só executar se a aba `upgrades` estiver ativa E throttle para ~250–500ms (ou apenas quando `state.crystals` mudou de ordem de magnitude). Reuso de `lastHeavyCheckTime`.
- `updateDisplay()` já usa `lastDisplayTexts` (só escreve no DOM se mudou) — manter.
- Pooling de partículas/floating text já existe (20/5); manter.

---

## Fase 7 — Caça e correção de bugs (game todo)
Revisar pontos críticos do código atual:
- **Save/load**: `isValidSaveShape` não valida `futureState` (Fase 0.2 cobre); checar `Number.isFinite` em todos os novos campos (reuso do padrão de A3).
- **Time travel edge cases**: ao viajar presente→passado→futuro→presente, `futureQuestStep` e `futureState` preservados; `syncStateWithEra` não sobrescreve `futureQuestStep`.
- **Gacha no futuro**: `getRandomItemByRarity`/`pullGacha` usam `getCurrentItemsDefs()` → automaticamente pool do futuro; `inventory` fim (`MAX_INVENTORY_SIZE=20`) — verificar se 26 itens do futuro + limite de inventário causam toast de "cheio" cedo demais (esperado; é mecânica).
- **`checkSpecialItems` no futuro**: `ownedSpecialItems` é global (root) — um item mítico obtido no presente não re-aparece no futuro (correto). Mas `ancestral_wisdom` é do passado; futuro tem seus 6. Confirmar que `getItemDef`/`getCurrentItemsDefs` busca no era certo.
- **Multiplicador**: garantir que Fr/Ascensão não quebrem o tanh (Fase 3.3).
- **`renderPortal` checklist**: usar `futureQuestStep` para mostrar progresso parcial (ex.: "Passo 3/7: comprar 10 upgrades do passado (8/10)").
- Rodar `tools/balance-sim.js` estendido com cenário `future` (Fr/Ascensão) para confirmar finitude.
- Testar fluxo completo em stub de DOM: presente→(prestígio×3, minerar, upgrades, ancestral_wisdom, equipar 2, 50 frag temporais)→futureQuestStep=8→travelToFuture→gacha/prestígio/Ascensão→save/load→voltar.

---

## Riscos
- **Save antigo**: merge com `futureState` default evita quebra (Fase 0.2). Validar abrindo save antigo.
- **Sobrecarga de DOM no futuro**: 26 itens + 22 upgrades + 6 especiais; com lazy tabs (Fase 6) o impacto é só na aba ativa.
- **Cadeia de 7 passos muito grindy**: tunar alvos (1e9 no passado, 50 frag temporais) após simulação; manter "ordenado" mas não punitivo.
- **Multiplicador explosivo**: Fr (cap 5e6 × 0.05) + Ascensão (cap alto × 0.20) entram no tanh → bounded.

---

## Ordem de implementação
1. Fase 0 (estado/load) — base para tudo.
2. Fase 1 (datasets futuro) + Fase 3.3 (multiplicador).
3. Fase 2 (cadeia 7 passos + canTravelToFuture + travel).
4. Fase 3.1–3.2 (Fr, Prestígio da Realidade, Ascensão).
5. Fase 4 (botão de som) —独立, fácil.
6. Fase 5 (UI/gráficos) e Fase 6 (otimização).
7. Fase 7 (bug hunt) + validação.

## Arquivos afetados
- `crystal-miner-corrigido.html` (todas as funções acima; adicionar `ITEMS_DEFS_FUTURE`, `UPGRADES_DEFS_FUTURE`, constantes, `futureState`, `futureQuestStep`, Fr/Ascensão, CSS `era-future`/sound-btn, lazy tabs).
- `tools/balance-sim.js` (cenário `future`).
- `.kilo/plans/...` (este plano).

## Validação final
- `node -e` sintaxe do `<script>`.
- `tools/balance-sim.js` com cenário future → PASS (finito, multiplier bounded).
- Stub DOM: fluxo presente→passado(cadeia 7)→futuro(gacha/prestígio/Ascensão)→save/load→voltar; sem erros; `futureQuestStep` progride 0→8.
- Manual: abrir no navegador, verificar botão de som não cobre gacha-coins, tema futurista aplica em `era-future`, abas lazy não travam, save antigo carrega.
