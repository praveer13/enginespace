/*
 * Data Book's components (REDESIGN 2.8): the site's atoms. Pages and games build from these and from the token roles in
 * ../tokens.ts, and set no colour or face of their own.
 */
export { StepControl, type StepControlProps } from './StepControl'
export { Header, MenuLink, type HeaderLink, type HeaderProps } from './Header'
export { Button, type ButtonProps } from './Button'
export { Field, type FieldProps } from './Field'
export { Glyph, Icon, type IconName } from './Glyph'
export { ReadoutStrip, type ReadoutStripLine, type ReadoutStripProps } from './ReadoutStrip'
export { Readout, type NumberTag, type ReadoutProps, type ReadoutUnit } from './Readout'
export { BusyMark, type BusyMarkProps } from './BusyMark'
export { PrimaryButton, type PrimaryButtonProps } from './PrimaryButton'
export { Label, type LabelProps } from './Label'
export { TextLink, type TextLinkProps } from './TextLink'
export { LoadingDots } from './LoadingDots'
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
