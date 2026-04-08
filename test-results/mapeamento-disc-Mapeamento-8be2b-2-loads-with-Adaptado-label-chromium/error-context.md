# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mapeamento-disc.spec.js >> Mapeamento DISC >> rank phase 2 loads with Adaptado label
- Location: tests\mapeamento-disc.spec.js:143:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=Adaptado')
Expected: visible
Error: strict mode violation: locator('text=Adaptado') resolved to 2 elements:
    1) <span>Adaptado — Rankings</span> aka getByText('Adaptado — Rankings')
    2) <p class="text-[10px] font-extrabold uppercase tracking-[2.5px] text-cyan-400 mb-1">Adaptado</p> aka getByText('Adaptado', { exact: true })

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=Adaptado')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - alert [ref=e2]
  - generic [ref=e3]:
    - banner [ref=e4]:
      - img "Vertho" [ref=e5]
      - button "Sair" [ref=e6]:
        - img [ref=e7]
    - main [ref=e10]:
      - generic [ref=e11]:
        - generic [ref=e12]:
          - generic [ref=e13]: Adaptado — Rankings
          - generic [ref=e14]: 48%
        - paragraph [ref=e15]: Adaptado
        - heading "Grupo 01" [level=1] [ref=e16]
        - paragraph [ref=e26]: 👍 MAIS PARECIDO
        - generic [ref=e27]:
          - generic [ref=e28]:
            - generic [ref=e29]: "1"
            - generic [ref=e30]: Constante
            - generic [ref=e31]:
              - button [disabled] [ref=e32]:
                - img [ref=e33]
              - button [ref=e35]:
                - img [ref=e36]
          - generic [ref=e38]:
            - generic [ref=e39]: "2"
            - generic [ref=e40]: Cativante
            - generic [ref=e41]:
              - button [ref=e42]:
                - img [ref=e43]
              - button [ref=e45]:
                - img [ref=e46]
          - generic [ref=e48]:
            - generic [ref=e49]: "3"
            - generic [ref=e50]: Criterioso(a)
            - generic [ref=e51]:
              - button [ref=e52]:
                - img [ref=e53]
              - button [ref=e55]:
                - img [ref=e56]
          - generic [ref=e58]:
            - generic [ref=e59]: "4"
            - generic [ref=e60]: Direcionador(a)
            - generic [ref=e61]:
              - button [ref=e62]:
                - img [ref=e63]
              - button [disabled] [ref=e65]:
                - img [ref=e66]
        - paragraph [ref=e68]: 👎 MENOS PARECIDO
        - button "AVANÇAR" [ref=e69]
    - button "BETO" [ref=e70]:
      - img [ref=e71]
      - generic [ref=e73]: BETO
    - navigation [ref=e74]:
      - button "Início" [ref=e75]:
        - img [ref=e76]
        - generic [ref=e79]: Início
      - button "Jornada" [ref=e80]:
        - img [ref=e81]
        - generic [ref=e84]: Jornada
      - button "Praticar" [ref=e85]:
        - img [ref=e86]
        - generic [ref=e88]: Praticar
      - button "Evolução" [ref=e89]:
        - img [ref=e90]
        - generic [ref=e93]: Evolução
      - button "Perfil" [ref=e94]:
        - img [ref=e95]
        - generic [ref=e98]: Perfil
```

# Test source

```ts
  54  |     const firstText = await firstCard.locator('span.flex-1').textContent();
  55  | 
  56  |     // Click the down arrow on the first card (second button in the pair, the ChevronDown one)
  57  |     const downBtn = firstCard.locator('button').last();
  58  |     await downBtn.click();
  59  | 
  60  |     // The former first card should now be second (index 1)
  61  |     const secondCard = page.locator('.space-y-2 > div').filter({ has: page.locator('span.flex-1') }).nth(1);
  62  |     const movedText = await secondCard.locator('span.flex-1').textContent();
  63  |     expect(movedText).toBe(firstText);
  64  |   });
  65  | 
  66  |   test('AVANCAR button works and advances to next group', async ({ page }) => {
  67  |     await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
  68  |     const avancar = page.locator('button:has-text("AVANÇAR")');
  69  |     await avancar.click();
  70  |     await expect(page.locator('text=Grupo 02')).toBeVisible({ timeout: 5000 });
  71  |   });
  72  | 
  73  |   test('completes all 8 ranking groups', async ({ page }) => {
  74  |     await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
  75  |     const avancar = page.locator('button:has-text("AVANÇAR")');
  76  |     for (let i = 0; i < 8; i++) {
  77  |       await avancar.click();
  78  |       await page.waitForTimeout(300);
  79  |     }
  80  |     // After 8 rank groups we should be in pairs phase 1
  81  |     await expect(page.locator('text=OU')).toBeVisible({ timeout: 5000 });
  82  |   });
  83  | 
  84  |   // ── Pairs Phase 1 ──
  85  | 
  86  |   test('pairs phase shows two cards and OU separator', async ({ page }) => {
  87  |     // Advance past 8 rank groups
  88  |     const avancar = page.locator('button:has-text("AVANÇAR")');
  89  |     await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
  90  |     for (let i = 0; i < 8; i++) {
  91  |       await avancar.click();
  92  |       await page.waitForTimeout(200);
  93  |     }
  94  |     await expect(page.locator('text=OU')).toBeVisible({ timeout: 5000 });
  95  |     await expect(page.locator('text=Par 1/6')).toBeVisible();
  96  |     // Two option cards (buttons with border-2)
  97  |     const pairCards = page.locator('button.rounded-2xl');
  98  |     await expect(pairCards).toHaveCount(2);
  99  |   });
  100 | 
  101 |   test('can select a pair option', async ({ page }) => {
  102 |     const avancar = page.locator('button:has-text("AVANÇAR")');
  103 |     await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
  104 |     for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(200); }
  105 |     await expect(page.locator('text=OU')).toBeVisible({ timeout: 5000 });
  106 | 
  107 |     // Click the first pair card
  108 |     const firstOption = page.locator('button.rounded-2xl').first();
  109 |     await firstOption.click();
  110 |     // After selection, the card should have a teal border (borderColor: #2DD4BF)
  111 |     await expect(firstOption).toHaveCSS('border-color', 'rgb(45, 212, 191)');
  112 |   });
  113 | 
  114 |   test('AVANCAR works in pairs', async ({ page }) => {
  115 |     const avancar = page.locator('button:has-text("AVANÇAR")');
  116 |     await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
  117 |     for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(200); }
  118 |     await expect(page.locator('text=Par 1/6')).toBeVisible({ timeout: 5000 });
  119 | 
  120 |     // Select first option then advance
  121 |     await page.locator('button.rounded-2xl').first().click();
  122 |     await avancar.click();
  123 |     await expect(page.locator('text=Par 2/6')).toBeVisible({ timeout: 5000 });
  124 |   });
  125 | 
  126 |   test('completes all 6 pairs', async ({ page }) => {
  127 |     const avancar = page.locator('button:has-text("AVANÇAR")');
  128 |     await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
  129 |     for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(200); }
  130 |     await expect(page.locator('text=OU')).toBeVisible({ timeout: 5000 });
  131 | 
  132 |     for (let i = 0; i < 6; i++) {
  133 |       await page.locator('button.rounded-2xl').first().click();
  134 |       await avancar.click();
  135 |       await page.waitForTimeout(300);
  136 |     }
  137 |     // Should transition to rank phase 2 (Adaptado)
  138 |     await expect(page.locator('text=Adaptado')).toBeVisible({ timeout: 5000 });
  139 |   });
  140 | 
  141 |   // ── Rank Phase 2 ──
  142 | 
  143 |   test('rank phase 2 loads with Adaptado label', async ({ page }) => {
  144 |     const avancar = page.locator('button:has-text("AVANÇAR")');
  145 |     await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
  146 |     // Phase 1 ranks
  147 |     for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(200); }
  148 |     // Phase 1 pairs
  149 |     for (let i = 0; i < 6; i++) {
  150 |       await page.locator('button.rounded-2xl').first().click();
  151 |       await avancar.click();
  152 |       await page.waitForTimeout(200);
  153 |     }
> 154 |     await expect(page.locator('text=Adaptado')).toBeVisible({ timeout: 5000 });
      |                                                 ^ Error: expect(locator).toBeVisible() failed
  155 |     await expect(page.locator('text=Grupo 01')).toBeVisible();
  156 |   });
  157 | 
  158 |   test('completes rank phase 2 (8 groups)', async ({ page }) => {
  159 |     const avancar = page.locator('button:has-text("AVANÇAR")');
  160 |     await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
  161 |     // Phase 1: 8 ranks + 6 pairs
  162 |     for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(150); }
  163 |     for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(150); }
  164 |     // Phase 2 ranks
  165 |     await expect(page.locator('text=Adaptado')).toBeVisible({ timeout: 5000 });
  166 |     for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(150); }
  167 |     // Should be in pairs phase 2
  168 |     await expect(page.locator('text=OU')).toBeVisible({ timeout: 5000 });
  169 |   });
  170 | 
  171 |   // ── Pairs Phase 2 ──
  172 | 
  173 |   test('completes pairs phase 2 (6 pairs)', async ({ page }) => {
  174 |     const avancar = page.locator('button:has-text("AVANÇAR")');
  175 |     await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
  176 |     // All phase 1
  177 |     for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(100); }
  178 |     for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(100); }
  179 |     // Phase 2 ranks
  180 |     for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(100); }
  181 |     // Phase 2 pairs
  182 |     for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(100); }
  183 |     // Should be on learning preferences
  184 |     await expect(page.locator('text=Como você aprende melhor?')).toBeVisible({ timeout: 5000 });
  185 |   });
  186 | 
  187 |   // ── Learning Preferences ──
  188 | 
  189 |   test('learning preferences shows 8 formats with stars', async ({ page }) => {
  190 |     const avancar = page.locator('button:has-text("AVANÇAR")');
  191 |     await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
  192 |     for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(100); }
  193 |     for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(100); }
  194 |     for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(100); }
  195 |     for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(100); }
  196 | 
  197 |     await expect(page.locator('text=Como você aprende melhor?')).toBeVisible({ timeout: 5000 });
  198 |     // 8 format rows
  199 |     const formatRows = page.locator('.space-y-2 > div').filter({ has: page.locator('button:has-text("★")') });
  200 |     await expect(formatRows).toHaveCount(8);
  201 |   });
  202 | 
  203 |   test('can rate each format with stars', async ({ page }) => {
  204 |     const avancar = page.locator('button:has-text("AVANÇAR")');
  205 |     await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
  206 |     for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(100); }
  207 |     for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(100); }
  208 |     for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(100); }
  209 |     for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(100); }
  210 | 
  211 |     await expect(page.locator('text=Como você aprende melhor?')).toBeVisible({ timeout: 5000 });
  212 |     // Click first star of first format row
  213 |     const firstRow = page.locator('.space-y-2 > div').filter({ has: page.locator('button:has-text("★")') }).first();
  214 |     const firstStar = firstRow.locator('button:has-text("★")').first();
  215 |     await firstStar.click();
  216 |     // Star should be highlighted (golden color)
  217 |     await expect(firstStar).toHaveCSS('color', 'rgb(252, 211, 77)');
  218 |   });
  219 | 
  220 |   test('VER MEU PERFIL button appears after all rated', async ({ page }) => {
  221 |     const avancar = page.locator('button:has-text("AVANÇAR")');
  222 |     await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
  223 |     for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(100); }
  224 |     for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(100); }
  225 |     for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(100); }
  226 |     for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(100); }
  227 | 
  228 |     await expect(page.locator('text=Como você aprende melhor?')).toBeVisible({ timeout: 5000 });
  229 | 
  230 |     // Rate all 8 formats (click 3rd star for each)
  231 |     const formatRows = page.locator('.space-y-2 > div').filter({ has: page.locator('button:has-text("★")') });
  232 |     const count = await formatRows.count();
  233 |     for (let i = 0; i < count; i++) {
  234 |       const row = formatRows.nth(i);
  235 |       await row.locator('button:has-text("★")').nth(2).click(); // 3 stars
  236 |       await page.waitForTimeout(50);
  237 |     }
  238 | 
  239 |     const verPerfil = page.locator('button:has-text("VER MEU PERFIL")');
  240 |     await expect(verPerfil).toBeEnabled();
  241 |   });
  242 | 
  243 |   // ── Results ──
  244 | 
  245 |   test('results page shows DISC profile code', async ({ page }) => {
  246 |     test.setTimeout(60000);
  247 |     const avancar = page.locator('button:has-text("AVANÇAR")');
  248 |     await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
  249 | 
  250 |     // Speed-run through all phases
  251 |     for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(80); }
  252 |     for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(80); }
  253 |     for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(80); }
  254 |     for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(80); }
```