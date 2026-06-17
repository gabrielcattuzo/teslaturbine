# Turbina de Tesla — Simulador Interativo

Simulador numérico interativo da Turbina de Tesla desenvolvido para o projeto prático da disciplina **Física das Oscilações, Ondas e Termodinâmica (FOOT)** — PUC-Campinas, 1º semestre de 2026.

**Autores:** Gabriel Cattuzo (RA 24015324) · Guilherme Dias Cavalheri (RA 24013423)  
**Orientador:** Prof. Leandro

---

## Sobre o Projeto

A Turbina de Tesla é uma turbina de fluxo centrípeto que opera por viscosidade e adesão do fluido (condição de não-deslizamento), sem palhetas. Este simulador implementa o modelo numérico de **Rice (1991)** com integração numérica (N = 300 subdivisões) para calcular torque, potência, número de Reynolds e eficiência energética em tempo real.

O protótipo físico foi construído com CDs/DVDs descartados alimentados por ar comprimido de compressor doméstico.

---

## Funcionalidades

- Cálculo em tempo real de torque, potência de entrada/saída e eficiência
- Integração numérica do perfil de vórtice livre (Rice, 1991)
- Detecção de regime de escoamento (laminar / transicional / turbulento)
- Balanço completo de perdas energéticas (viscosa, cinética, axial, mecânica, vazamento)
- Animação do escoamento espiral entre os discos
- 6 gráficos de análise paramétrica:
  - Eficiência × RPM
  - P entrada vs P saída × RPM
  - P entrada vs P saída × Pressão
  - Eficiência × Pressão
  - P entrada vs P saída × Gap
  - Eficiência × Nº de Discos
- Aviso automático quando os parâmetros extrapolam o regime experimental (η > 30%)

---

## Tecnologias

- [React 18](https://react.dev/) + [Vite 5](https://vitejs.dev/)
- Canvas API (gráficos e animação — sem bibliotecas externas)
- JavaScript puro para o motor físico

---

## Instalação e Uso

**Pré-requisitos:** Node.js 18+

```bash
# Instalar dependências
npm install

# Rodar em desenvolvimento
npm run dev

# Build para produção
npm run build

# Preview do build
npm run preview
```

Acesse `http://localhost:5173` após rodar `npm run dev`.

---

## Parâmetros do Simulador

| Parâmetro | Símbolo | Range | Padrão |
|---|---|---|---|
| Diâmetro do disco | ∅ | 80–300 mm | 120 mm |
| Nº de discos | N | 2–12 | 8 |
| Espaçamento entre discos | e | 1,0–5,0 mm | 1,0 mm |
| Diâmetro do bico injetor | d_bico | 2,5–8,0 mm | 3,0 mm |
| RPM medido | ω | 100–3000 | 938 |
| Pressão de entrada | ΔP | 1,5–6,0 bar | 2,0 bar |
| Vazão volumétrica | Q | 1,0–20 L/min | 5,0 L/min |

Os valores padrão correspondem ao ponto de operação de referência do protótipo (η ≈ 28,1%).

---

## Modelo Físico

O motor físico implementa as equações da Seção 3 do relatório:

**Velocidade no bico:**
$$v_{in} = \frac{Q}{A_{bico}}$$

**Perfil de vórtice livre:**
$$\omega_{fl}(r) = \frac{v_{in} \cdot R}{r^2}$$

**Torque por integração numérica:**
$$T_{total} = 2(N-1) \int_{r_0}^{R} \frac{\mu \left(\omega_{fl}(r) - \omega\right)}{e} \cdot 2\pi r^2 \, dr$$

**Potência de entrada:**
$$P_{entrada} = \Delta P \cdot Q + \frac{1}{2}\rho Q v_{in}^2$$

**Eficiência:**
$$\eta = \frac{T_{total} \cdot \omega}{P_{entrada}}$$

**Limite experimental:** protótipos de CDs apresentam η entre 5% e 30% (Capata & Calabria, 2026). O simulador exibe aviso quando a combinação de parâmetros extrapola esse regime.

---

## Estrutura do Projeto

```
src/
└── App.jsx        # Componente principal + motor físico + gráficos
public/
└── vite.svg
index.html
package.json
vite.config.js
```

---

## Referências

- RICE, W. An analytical and experimental investigation of multiple-disk turbines. *Journal of Engineering for Power*, 1991.
- CAPATA, R.; CALABRIA, A. The Tesla Turbine — Design, Simulations, Testing and Proposed Applications. *Eng*, v. 7, n. 1, p. 30, 2026. DOI: 10.3390/eng7010030.
- SENGUPTA, S. et al. Experimental study of a Tesla turbine prototype. 2022.