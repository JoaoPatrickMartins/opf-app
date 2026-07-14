# OPF — App de desktop (clique para abrir)

Empacota o OPF (backend Node + frontend web) num aplicativo nativo com **Electron**:
ao abrir, ele sobe o servidor embutido numa porta livre e mostra o app numa janela própria.

> **Requisito de uso:** internet — o banco é o **MongoDB Atlas** (nuvem).
> **Segurança:** o `.env` (com a URI do Mongo e a chave da Groq) fica **dentro** do
> executável. Trate o arquivo gerado como pessoal: **não compartilhe** o `.AppImage`/`.exe`,
> pois ele dá acesso ao seu banco.

---

## Linux (Pop!_OS)

**Gerar (produz `.deb` e `.AppImage`):**
```bash
npm install          # só na primeira vez
npm run desktop:build
```
Saídas em `release/`: `OPF-1.0.0.deb` e `OPF-1.0.0.AppImage`.

> ⚠️ Rode na sua **máquina Pop!_OS**, não dentro de um container/servidor headless
> (lá faltam FUSE e as bibliotecas gráficas do Chromium). Se estiver usando dev container,
> baixe o arquivo (VS Code: botão direito no arquivo em `release/` → *Download*).

### Opção A — `.deb` (recomendada no Pop!_OS)
Instala como um programa normal, com **ícone no menu de aplicativos** e **sem FUSE**:
```bash
sudo apt install ./release/OPF-1.0.0.deb
```
Depois é só procurar **OPF** no menu e clicar. (Instala em `/opt/OPF`.)
Para remover: `sudo apt remove opf-app`.

### Opção B — `.AppImage` (arquivo único, sem instalar)
```bash
chmod +x release/OPF-1.0.0.AppImage
./release/OPF-1.0.0.AppImage
```
- Se aparecer erro de **FUSE** (`libfuse.so.2`), instale `sudo apt install libfuse2`
  **ou** rode com: `./release/OPF-1.0.0.AppImage --appimage-extract-and-run`

### Atualizar o app (depois de mexer no código)

No ambiente de desenvolvimento (onde há Node), **um comando** gera a nova versão:
```bash
npm run desktop:release
```
Isso incrementa a versão (1.0.1 → 1.0.2 …) e regenera `release/OPF-<versão>.deb` e `.AppImage`.

Depois, na sua máquina, **instale por cima** do que já está:
```bash
sudo apt install ./OPF-<versão>.deb      # ex.: ./OPF-1.0.2.deb
```
O `apt` atualiza no lugar — mesmo ícone no menu, só a versão nova. Não precisa desinstalar,
e nada se perde (seus dados ficam no MongoDB na nuvem, não no app).

> `desktop:build` reconstrói mantendo a versão; `desktop:release` **sobe a versão** — use
> este para atualizações, pois é o número maior que faz o `apt` reconhecer como update.

---

## Windows — .exe (instalador)

⚠️ Não é possível gerar o `.exe` a partir do Linux sem Wine. Gere **numa máquina Windows**
(com Node 20+ instalado), com o projeto copiado para lá:
```bash
npm install
npm run desktop:build:win
```
Saída: `release/OPF-1.0.0.exe` (instalador). Depois de instalado, abre como um programa
comum, com ícone no menu Iniciar.

> A build do Windows também roda no Linux **se** o Wine estiver instalado
> (`npm run desktop:build:win`), mas o caminho recomendado é buildar no próprio Windows.

---

## Desenvolvimento

- Rodar o app desktop apontando para o código atual (sem empacotar):
  ```bash
  npm run build          # gera frontend/dist (a janela serve o build)
  npm run desktop:dev
  ```
- Fluxo de dev normal no navegador continua igual:
  `npm run dev:backend` + `npm run dev:frontend`.

---

## Como funciona (resumo técnico)

- `desktop/main.cjs` — processo principal do Electron. Define `OPF_ENV_PATH`,
  `OPF_STATIC_DIR` e `BACKEND_PORT=0`, importa `backend/src/index.js` e chama
  `startServer()`, que retorna a porta real; a janela carrega `http://localhost:<porta>/`.
- `backend/src/index.js` — expõe `startServer()`, serve a API (`/api/*`) **e** o
  frontend compilado (`frontend/dist`) no mesmo servidor (mesma origem, sem proxy).
- `build/icon.png` — ícone do app (gerado por `npm run icon`).
- Config de empacotamento: campo `build` do `package.json` (electron-builder).
