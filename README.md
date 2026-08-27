# Catan

A digital board game implementation. Supports two ways to play:

- **Same screen** — pass one device around the table.
- **LAN network game** — one player hosts, everyone else joins from their own device on the same Wi-Fi.

## Playing a LAN network game

One player (the host) needs a terminal; everyone else just needs a browser.

**Host:**

```sh
npm install
npm run host
```

This builds the app and starts a local server. The terminal prints an address like `http://192.168.1.29:8080` — that's what everyone else will open. Open that same address (or `http://localhost:8080`) in your own browser to join as a player too.

**Everyone else:** open the address the host gave you in any browser on the same Wi-Fi, enter your name, and wait in the lobby for the host to start (3–4 players required).

A few things worth knowing:

- If your Wi-Fi dies mid-game, the app automatically tries to reconnect, and closing/reopening the tab rejoins you as the same player rather than a new one.
- If the host's process is stopped, the game cannot be resumed — this only recovers from network drops, not the host machine going away.
- Everyone's own hand (resources, development cards) stays on their own device; the host never sends anyone else's hand to a device it doesn't belong to.

## Development

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default tseslint.config({
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

- Replace `tseslint.configs.recommended` to `tseslint.configs.recommendedTypeChecked` or `tseslint.configs.strictTypeChecked`
- Optionally add `...tseslint.configs.stylisticTypeChecked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and update the config:

```js
// eslint.config.js
import react from 'eslint-plugin-react'

export default tseslint.config({
  // Set the react version
  settings: { react: { version: '18.3' } },
  plugins: {
    // Add the react plugin
    react,
  },
  rules: {
    // other rules...
    // Enable its recommended rules
    ...react.configs.recommended.rules,
    ...react.configs['jsx-runtime'].rules,
  },
})
```
