# Plano: Auditoria de Bugs + "Milhares de Pequenas Coisas" (Crystal Miner)

## Contexto
O jogo é um único arquivo `crystal-miner-corrigido.html` (~3033 linhas), um idle/clicker (`Crystal Miner` / `Crystal-clicker`) com:
- Poder de clique + produção automática (`getClickPower`/`getAutoPower`).
- Multiplicador global (nível, prestígio, fragmentos temporais) em `getTotalMultiplier`.
- Sistemas: upgrades (presente + passado), gacha (pity, 10-pull), conquistas, inventário/equipamento (2 slots), contratos diários, rumores (hints), viagem no tempo (presente↔passado), prestígio em cada era, produção offline, save/load com import/export base64.
- Loop de jogo em `setInterval(gameLoop, 100)` e verificações "pesadas" a cada 1s.

O arquivo já contém comentários "BUG FIX #1–#5" (corrupção de save, lifetime globals, exploits de itens especiais, throttle de checks). O objetivo deste plano é (1) **caçar e corrigir bugs reais remanescentes** e (2) **adicionar milhares de pequenas melhorias** (conteúdo orientado a dados + polish) para deixar o jogo mais completo.

Decisão confirmada com o usuário: **bugs primeiro, depois conteúdo**.

Tudo é editável em um único arquivo HTML; nenhuma dependência externa/build. Mudanças devem preservar a estrutura existente (arrays `ITEMS_DEFS`, `UPGRADES_DEFS`, `ACHIEVEMENTS_DEFS`, etc.).

---

## Fase A — Auditoria e Correção de Bugs

### A1. Bugs de lógica/contradição de progresso
- **B1 (crítico, design): Viagem no tempo é quase impossível.** `canTimeTravel` (linha 1771) exige `state.goldenCrystalsCaught >= 100`, mas `doPrestige`/`doPrestigePast` (linhas 1669/1694) resetam `goldenCrystalsCaught = 0` a cada prestígio, e o requisito também exige `state.prestigeCount >= 10`. O jogador precisa acumular 100 cristais dourados *depois* do 10º prestígio — contradição de design. Corrigir: usar um contador `lifetimeGoldenCrystalsCaught` (nunca resetado) para o requisito de viagem e para `singularity_core`, mantendo `goldenCrystalsCaught` de era para a mecânica do cristal dourado.
- **B2: Contrato diário "level 15" quebra após prestígio.** `DAILY_CONTRACTS_DEFS.level` (linha 1036) usa `getLevel(s.totalCrystals)` (resetado no prestígio). Trocar para `getLevel(s.lifetimeTotalCrystals)` para ser viável pós-prestígio.
- **B3: `singularity_core` (source 'special') depende de `goldenCrystalsCaught >= 100`** que é resetado no prestígio; combinado com B1, normalizar via `lifetimeGoldenCrystalsCaught`.

### A2. Robustez de estado / NaN / saves
- **B4: Faltam guardas contra NaN.** `autoAccumulator`, `totalCrystals`, `crystals` podem ficar `NaN` após save corrompido/editado, quebrando `gameLoop` (linha 2772+). Adicionar coerção `Number.isFinite()` / `|| 0` em `loadStateFromEra` e `loadState`, e proteção em `getAutoPower`/`getClickPower` (retornar 0 se NaN).
- **B5: `applyOfflineProduction` (linha 2916) não dispara special items/achievements** até o próximo tick pesado; chamar `checkSpecialItems()`/`checkAchievements()`/`checkHints()` ao final para não perder desbloqueios offline.
- **B6: `isValidSaveShape` não valida campos numéricos nem `upgrades`/inventory**; um save com `crystals: "abc"` passa. Estender validação mínima de tipos (crystals/totalCrystals number, presentState/pastState com upgrades object).
- **B7: `importSave` (linha 2896) usa `prompt`/`atob`**; tratar saves muito grandes (quota) e validar `parsed` não só shape mas tipos antes de sobrescrever.

### A3. Bugs de UI/interação
- **B8: `clickGoldenCrystal` (linha 1604) — bonus pode ser 0 cedo** (`getAutoPower()*30`); garantir mínimo de pelo menos `getClickPower()*20` sempre (já faz, mas se autoPower=0 fica só clique*20 — ok; revisar para não dar 0).
- **B9: Toast/HTML injection.** `showToast` usa `innerHTML` com `text`; nunca é controlado por usuário hoje, mas futuras strings de conteúdo devem evitar HTML. Trocar para `textContent` + elemento ícone separado para evitar XSS acidental ao adicionar "milhares" de strings.
- **B10: `renderPortal`/`renderRumors` podem fazer referência a `state.era` trocado durante viagem** sem `renderAll` completo em alguns fluxos; garantir `renderAll()` pós-time-travel (já chama, confirmar que todos os painéis atualizam badges).
- **B11: Foco acessível / teclado.** `crystalButton` tem `tabindex` mas não há handler de `keydown` (Enter/Espaço) para clicar; adicionar para acessibilidade.

### A4. Validação dos bugs
- Abrir o HTML no navegador (ou via `python3 -m http.server` em `/tmp`) e testar manualmente: novo save, clicar, comprar upgrade, gacha, prestígio (verificar `goldenCrystalsCaught`), viajar no tempo, import/export de save editado, recarregar (offline production), contrato diário.
- Injetar save com `crystals:"x"` e `autoAccumulator:NaN` para confirmar que B4/B6 protegem.

---

## Fase B — "Milhares de Pequenas Coisas" (conteúdo orientado a dados + polish)

Como o jogo é data-driven, a maioria das "pequenas coisas" é **adicionar entradas aos arrays de definição** + ajustes de UI. Organizar como tarefas repetíveis por categoria, cada uma escalável para dezenas/centenas de itens.

### B1. Conteúdo (datasets)
- **Itens (gacha):** adicionar dezenas de itens por raridade em `ITEMS_DEFS` e `ITEMS_DEFS_PAST` (novos `id`/`name`/`icon`/`baseBonus`/`percentBonus`), mantendo `source:'gacha'`. Ex.: mais picaretas, reatores, totens.
- **Upgrades:** expandir `UPGRADES_DEFS`/`UPGRADES_DEFS_PAST` com novas tier-lists (custos exponenciais, `unlock` baseado em `lifetimeTotalCrystals`/`prestigeCount`), preenchendo lacunas entre 1e9 e 1e15.
- **Conquistas:** adicionar centenas em `ACHIEVEMENTS_DEFS` (marcos de cliques, cristais, prestígios, gacha pulls, golden caught, itens lendários) — fácil escalar para "milhares" com geradores.
- **Contratos diários:** ampliar `DAILY_CONTRACTS_DEFS` com variações (cliques X, mine Y, capture Z goldens, compre N upgrades, alcance nível L, equipe item, faça prestígio).
- **Melhorias temporais:** mais `TEMPORAL_UPGRADES_DEFS` (produção, clique, gacha, offline, golden chance).
- **Itens especiais/míticos:** novos `source:'special'`/`'mythic'` com `unlockCondition` e `hints` progressivos (já há padrão em `checkSpecialItems`/`getProgressForItem`).
- **Rumores/NPC:** mais linhas de `hints` e diálogos (`showNPCDialog`) para densidade narrativa.
- **Fragmentos de sorte:** estender `tryDropLuckyFragment` com mais níveis/tiers e recompensas.

### B2. Polish de UX/QoL ("pequenas coisas" de interface)
- Toast de fila com limite e auto-dismiss; evitar spam quando "milhares" de conquistas desbloqueiam de uma vez (B9 + agrupar toasts).
- Indicador de "novo!" em abas com badge (já existe para contracts; estender para gacha/inventory/rumors).
- Tooltip nos itens/upgrades mostrando bônus exato + multiplicador global.
- Confirmação de venda em massa / "vender todos os comuns".
- Ordenação/filtro de inventário por raridade.
- Barra de progresso de prestígio e "próximo ganho".
- Contador de pity de gacha visível (já há `pityCounter`).
- Animações sutis em aquisição de item lendário/mítico.
- Modo "offline production" com resumo detalhado (tempo ausente, taxa/s, total).

### B3. Balanceamento e progressão
- Curva de custo dos upgrades revisada para suportar o conteúdo novo (evitar `Infinity` em `Math.pow(costMult, level)` com level alto).
- Cap de `formatNumber` além de `T` (aa/ab/... ou notação científica) para "milhares" de upgrades escalarem.
- `getPrestigeGain`/`getPrestigeGainPast` com teto para não estourar.

### B4. Acessibilidade e robustez
- `prefers-reduced-motion` para desligar partículas/floating text.
- `aria-live` no contador de cristais para leitores de tela.
- Handlers de teclado (B11) + navegação por abas com setas.
- `localStorage` quota: try/catch já existe; adicionar fallback para `sessionStorage`.

### Estratégia de escala para "milhares"
- Criar helpers geradores (ex.: `makeUpgrades(range)`, `makeAchievements(tiers)`) **dentro do script** para produzir centenas de entradas sem poluir manualmente, mantendo os arrays existentes como base. Isso torna "milhares de pequenas coisas" viável e consistente.
- Manter cada alteração pequena e isolada; não reescrever sistemas core.

---

## Riscos
- **Save incompatível:** adicionar campos novos em definições não quebra saves antigos (loadState faz merge/ensure). Validar com save antigo após cada lote grande.
- **Performance:** milhares de conquistas/upgrades renderizados podem travar o DOM. Mitigar com lazy-render (só aba ativa) e paginação/virtualização leve nos painéis.
- **Balanceamento:** muito conteúdo pode desequilibrar; revisar ganhos de prestígio e offline.

## Ordem de execução recomendada
1. Fase A (A1→A4) — corrigir bugs, com validação manual.
2. Fase B1 (datasets) usando geradores — conteúdo.
3. Fase B2/B3/B4 — polish, balance, acessibilidade.
4. Validação final: abrir no navegador, novo save, prestígio, viagem no tempo, import/export, recarregar.

## Validação final
- `python3 -m http.server` em `/tmp` + abrir `crystal-miner-corrigido.html`; testar fluxos do Fase A4 e B.
- Verificar console sem erros; confirmar que saves antigos ainda carregam; confirmar que "milhares" de conquistas/upgrades aparecem e o jogo continua jogável (sem travar o loop).
