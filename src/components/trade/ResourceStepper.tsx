import type { ResourceType } from '../../game/models/types';
import { RESOURCE_DISPLAY } from '../../data/terrainTheme';

interface ResourceStepperProps {
  resource: ResourceType;
  value: number;
  max?: number;
  onChange: (next: number) => void;
}

/** A single [-] icon count [+] row used to build offer/request bundles. */
export function ResourceStepper({ resource, value, max, onChange }: ResourceStepperProps) {
  const { icon, label } = RESOURCE_DISPLAY[resource];
  const atMax = max !== undefined && value >= max;

  return (
    <div className="resource-stepper">
      <button
        type="button"
        className="resource-stepper__btn"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
        aria-label={`Decrease ${label}`}
      >
        −
      </button>
      <span className="resource-stepper__label">
        <span aria-hidden="true">{icon}</span> {label}
      </span>
      <span className="resource-stepper__value">{value}</span>
      <button
        type="button"
        className="resource-stepper__btn"
        onClick={() => onChange(value + 1)}
        disabled={atMax}
        aria-label={`Increase ${label}`}
      >
        +
      </button>
    </div>
  );
}
