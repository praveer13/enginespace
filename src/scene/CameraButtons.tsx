import { Button } from '@/design/components/Button'
import type { CameraPreset } from './camera-rig'

/*
 * The camera presets as buttons (GAMES.md §2.3): every view the rig can take is one press away, and `C` cycles them
 * (camera-rig.ts's `nextPreset`, bound by the game or page that holds the keys). The current preset is pressed. They are
 * DOM controls outside the canvas, so they work in the 2D view too, where they do nothing harmful: the 2D view ignores them.
 */

export interface CameraButtonsProps {
  presets: readonly Pick<CameraPreset, 'id' | 'label'>[]
  value: string
  onChange: (id: string) => void
  /** The group's name. Default "Camera". */
  label?: string
  disabled?: boolean
}

export function CameraButtons({ presets, value, onChange, label = 'Camera', disabled = false }: CameraButtonsProps) {
  return (
    <div role="group" aria-label={label} className="es-camera-buttons">
      {presets.map((preset) => (
        <Button
          key={preset.id}
          size="sm"
          variant={preset.id === value ? 'ink' : 'plate'}
          aria-pressed={preset.id === value}
          aria-keyshortcuts="C"
          disabled={disabled}
          onClick={() => onChange(preset.id)}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  )
}
