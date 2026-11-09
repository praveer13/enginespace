import { Canvas } from '@react-three/fiber'
import { WebGLRenderer } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// Three's core and R3F belong in three-vendor. An addon belongs to the chunk that uses it.
export const probe = { Canvas, WebGLRenderer, OrbitControls }
