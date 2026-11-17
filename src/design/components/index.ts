/*
 * Data Book's components (REDESIGN 2.8): the site's atoms. Pages and games build from these and from the token roles in
 * ../tokens.ts, and set no colour or face of their own. Sheet is the sheet, Stub the primary button, PrinterTape the readout strip,
 * TapeLabel the plain label, Toggle the switch, and Board the header and the footer.
 */
export { Bell, type BellProps } from './Bell'
export { Board, MenuLink, type BoardLink, type BoardProps } from './Board'
export { Button, type ButtonProps } from './Button'
export { Field, type FieldProps } from './Field'
export { Glyph, Icon, type IconName } from './Glyph'
export { Pan, type PanProps } from './Pan'
export { PrinterTape, type PrinterTapeLine, type PrinterTapeProps } from './PrinterTape'
export { Rail, type RailProps } from './Rail'
export { Readout, type NumberTag, type ReadoutProps, type ReadoutUnit } from './Readout'
export { StationLight, type StationLightProps } from './StationLight'
export { Stub, type StubProps } from './Stub'
export { TapeLabel, type TapeLabelProps } from './TapeLabel'
export { TextLink, type TextLinkProps } from './TextLink'
export { PrintingDots } from './PrintingDots'
export { Sheet, SheetLine, type SheetProps, type SheetState } from './Sheet'
export { Toggle, type ToggleProps } from './Toggle'

// Wave R's components (REDESIGN 2.8, stage 1): the parts the lesson template and the instrument frame are made of. They use the
// token roles only, so they draw under the current values and under Data Book's.
export { Callout, type CalloutProps } from './Callout'
export { DeltaChip, type DeltaChipProps } from './DeltaChip'
export { GoalLine, type GoalLineProps } from './GoalLine'
export { Legend, type LegendEntry, type LegendProps } from './Legend'
export { LevelMenu, type LevelMenuProps, type LevelOption } from './LevelMenu'
export { Marker, type MarkerProps } from './Marker'
export { NextStep, type NextStepProps } from './NextStep'
export { Note, type NoteKind, type NoteProps } from './Note'
export { NumberLine, type NumberLineProps, type NumberPin } from './NumberLine'
export { PartsList, type PartRow, type PartsListProps } from './PartsList'
export { Popover, type PopoverProps } from './Popover'
export { SectionRail, type RailPart, type RailSection, type SectionRailProps } from './SectionRail'
export { Stamp, TagLegend, TAG_LEGEND, UNVERIFIED_MEANS, type StampProps } from './Stamp'
export { TitleBlock, type TitleBlockProps } from './TitleBlock'
