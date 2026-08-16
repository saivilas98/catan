import { useEffect, useRef, useState } from 'react';
import type { ResourceCount } from '../../game/models/types';
import { RESOURCE_TYPES } from '../../game/models/types';
import { RESOURCE_DISPLAY } from '../../data/terrainTheme';

interface YourResourcesProps {
  resources: ResourceCount;
}

/**
 * The current player's exact hand, always shown in full — this is the one panel
 * where hiding numbers would make no sense, since it is always your own hand.
 * A resource chip briefly pulses when its count changes, so a production or trade
 * result is easy to notice without a distracting animation.
 */
export function YourResources({ resources }: YourResourcesProps) {
  const previous = useRef(resources);
  const [flashing, setFlashing] = useState<Set<string>>(new Set());

  useEffect(() => {
    const changed = new Set<string>();
    for (const resource of RESOURCE_TYPES) {
      if (previous.current[resource] !== resources[resource]) changed.add(resource);
    }
    previous.current = resources;
    if (changed.size === 0) return;

    setFlashing(changed);
    const timer = window.setTimeout(() => setFlashing(new Set()), 700);
    return () => window.clearTimeout(timer);
  }, [resources]);

  return (
    <section className="your-resources">
      <h3 className="your-resources__title">Your Resources</h3>
      <ul className="your-resources__list">
        {RESOURCE_TYPES.map((resource) => {
          const { icon, label } = RESOURCE_DISPLAY[resource];
          const count = resources[resource];
          return (
            <li
              key={resource}
              className={`your-resource${flashing.has(resource) ? ' your-resource--flash' : ''}${
                count > 0 ? ' your-resource--held' : ''
              }`}
              title={label}
            >
              <span className="your-resource__icon" aria-hidden="true">
                {icon}
              </span>
              <span className="your-resource__count">{count}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
