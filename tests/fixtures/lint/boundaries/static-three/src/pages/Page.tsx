import { WebGLRenderer } from 'three'

export function Page() {
  return <p>{String(new WebGLRenderer())}</p>
}
