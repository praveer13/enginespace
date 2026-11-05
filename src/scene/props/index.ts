/*
 * Scene kit v1: the kitchen's props, light and atmosphere, for every 3D game of the course (TRACKER, "W1 scene kit v1: the look of
 * a real line"). A scene wraps its props in <Kitchen>, lists its static props as data for one <StaticSet>, and adds the props that
 * move: tickets, clips, the printer's feed, plates, the bell, the heat lamps' light and the steam.
 *
 * For a prop of a later game (the reach-in, tasting spoons, the dumbwaiter's car): build it from shape.ts's helpers (a rounded box, a
 * lathe, a sweep round a rounded rectangle, a bent tube), colour it through the palette's tones, give its glowing parts a channel so
 * a mask lights it or leaves it dark in the lamp's amber, and give it a footprint for its contact shadow. A label goes on masking
 * tape in a slot (specs.ts's panTapeSlot), and its words are DOM.
 */
export { Kitchen } from './Kitchen'
export { useProps, type PropsKit, type ShadowRegistry } from './context'
export { Prop, StaticSet } from './StaticSet'
export { ALWAYS_LIT, buildSet, litMask } from './set'
export { RailClips, PrinterFeed, Tickets, type ClipPlace, type TicketPose } from './Tickets'
export { LampLights, Plates, ServiceBell, Steam, STEAM, type LampLight, type PlatePlace } from './Service'
export { cellOffset, CLIP_DROP, PRINTER_MOUTH, tearPose, ticketGeometry } from './paper'
export { buildProp, insetPath, panGeometries, plateProfile, type Footprint } from './build'
export { CHANNEL, paletteFrom, type Palette, type Tone } from './palette'
export { bent, block, cap, lathe, painted, rod, roundedBox, roundedRectPath, straightPath, sweep, tube, type Part, type Surface } from './shape'
export { bakeOcclusion } from './occlusion'
export { feedSteps, useMotionLoop } from './motion'
