// The entry of tests/build.test.ts's fixture build. It uses what the app's entry uses (React, ReactDOM and a zustand
// store), and it reaches three only through a dynamic import, so three-vendor must stay out of its static imports
// (ARCHITECTURE §6.10).
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createStore } from 'zustand/vanilla'

const store = createStore(() => ({ opened: false }))
const open = () => {
  store.setState({ opened: true })
  void import('./scene').then((scene) => console.log(scene.probe))
}
createRoot(document.body).render(createElement('button', { onClick: open }, 'Open the scene'))
