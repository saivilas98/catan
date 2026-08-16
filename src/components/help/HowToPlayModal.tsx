import { useState } from 'react';
import type { ReactNode } from 'react';

interface HowToPlayModalProps {
  onClose: () => void;
}

interface Section {
  title: string;
  eyebrow: string;
  body: ReactNode;
}

/** A little chip showing "cost", e.g. 🧱1 🌲1 — reuses the emoji already used everywhere else. */
function Cost({ items }: { items: Array<[string, number]> }) {
  return (
    <span className="htp-cost">
      {items.map(([icon, n]) => (
        <span key={icon} className="htp-cost__item">
          {icon} {n}
        </span>
      ))}
    </span>
  );
}

const SECTIONS: Section[] = [
  {
    eyebrow: 'Step 1',
    title: 'The Goal',
    body: (
      <>
        <p>Be the first player to reach <strong>10 points</strong>. That&rsquo;s it — that&rsquo;s the whole game.</p>
        <p>You get points by building things on the board, and by holding a few special bonuses. The Score section below shows exactly how points add up.</p>
      </>
    ),
  },
  {
    eyebrow: 'Step 2',
    title: 'The Board',
    body: (
      <>
        <p>The board is made of hexagon tiles. Each tile is a terrain that makes one resource:</p>
        <ul className="htp-list">
          <li>🌲 Forest → Lumber</li>
          <li>🧱 Hills → Brick</li>
          <li>🌾 Fields → Grain</li>
          <li>🐑 Pasture → Wool</li>
          <li>⛰️ Mountains → Ore</li>
          <li>🏜️ Desert → nothing (the robber starts here)</li>
        </ul>
        <p>Every tile has a number on it (2–12). When that number is rolled, the tile produces resources.</p>
      </>
    ),
  },
  {
    eyebrow: 'Step 3',
    title: 'Setting Up',
    body: (
      <>
        <p>Before the first turn, each player places <strong>2 settlements</strong> and <strong>2 roads</strong> on the board, taking turns.</p>
        <p>Settlements go on the corners where tiles meet. Your second settlement is special — you immediately collect one resource from every tile touching it, so your first turn already has something in hand.</p>
      </>
    ),
  },
  {
    eyebrow: 'Step 4',
    title: 'Your Turn',
    body: (
      <>
        <p>A turn has a simple shape:</p>
        <ol className="htp-list htp-list--numbered">
          <li><strong>Roll the dice.</strong> Every player who has a settlement or city on a tile with that number collects resources — not just you.</li>
          <li><strong>Build and trade.</strong> Spend resources on roads, settlements, cities, or development cards. Trade with other players or with the bank.</li>
          <li><strong>End your turn.</strong> Pass the laptop to the next player.</li>
        </ol>
        <p className="htp-note">Rolling a <strong>7</strong> is different — see the Robber section.</p>
      </>
    ),
  },
  {
    eyebrow: 'Step 5',
    title: 'Building',
    body: (
      <>
        <p>Each piece costs resources, and is worth points once built:</p>
        <div className="htp-build-row">
          <div>
            <strong>Road</strong> — connects your settlements
            <Cost items={[['🧱', 1], ['🌲', 1]]} />
          </div>
          <div>
            <strong>Settlement</strong> — worth 1 point
            <Cost items={[['🧱', 1], ['🌲', 1], ['🐑', 1], ['🌾', 1]]} />
          </div>
          <div>
            <strong>City</strong> — upgrades a settlement, worth 2 points
            <Cost items={[['🌾', 2], ['⛰️', 3]]} />
          </div>
        </div>
        <p>A settlement must be at least two roads away from any other settlement or city — no crowding your neighbours.</p>
      </>
    ),
  },
  {
    eyebrow: 'Step 6',
    title: 'Trading',
    body: (
      <>
        <p>Short on a resource? You have two options:</p>
        <ul className="htp-list">
          <li><strong>Trade with players.</strong> Offer a swap — anyone can accept.</li>
          <li><strong>Trade with the bank.</strong> Usually 4 of one resource for 1 of another. If you own a port, it&rsquo;s cheaper — 3:1 at any port, or 2:1 at a matching resource port.</li>
        </ul>
      </>
    ),
  },
  {
    eyebrow: 'Step 7',
    title: 'Development Cards',
    body: (
      <>
        <p>
          Buy a card for <Cost items={[['🐑', 1], ['🌾', 1], ['⛰️', 1]]} /> — it&rsquo;s drawn face-down, and only you know what it is.
        </p>
        <ul className="htp-list">
          <li>🛡️ <strong>Knight</strong> — move the robber and steal a card. Play three and you earn Largest Army.</li>
          <li>🛣️ <strong>Road Building</strong> — place 2 roads for free.</li>
          <li>🎁 <strong>Year of Plenty</strong> — take any 2 resources from the bank.</li>
          <li>💰 <strong>Monopoly</strong> — name a resource; every other player hands you all of theirs.</li>
          <li>⭐ <strong>Victory Point</strong> — worth 1 point. Keep it secret until it wins you the game.</li>
        </ul>
      </>
    ),
  },
  {
    eyebrow: 'Step 8',
    title: 'The Robber',
    body: (
      <>
        <p>Roll a <strong>7</strong> and things change for a moment:</p>
        <ul className="htp-list">
          <li>Anyone holding more than 7 cards discards half of them.</li>
          <li>The player who rolled moves the robber to any tile.</li>
          <li>That tile stops producing resources until the robber moves again.</li>
          <li>They steal one random card from a player with a building there.</li>
        </ul>
        <p>A Knight card moves the robber too, any time you play it.</p>
      </>
    ),
  },
  {
    eyebrow: 'Step 9',
    title: 'Scoring & Winning',
    body: (
      <>
        <p>Points come from:</p>
        <ul className="htp-list">
          <li>🏠 Settlement — 1 point each</li>
          <li>🏛 City — 2 points each</li>
          <li>⭐ Victory Point cards — 1 point each (hidden until the game ends)</li>
          <li>🏆 Longest Road — 2 points, for the longest continuous road of 5+</li>
          <li>⚔ Largest Army — 2 points, for the first to play 3 Knights</li>
        </ul>
        <p>First to <strong>10 points</strong> wins immediately — even mid-turn.</p>
      </>
    ),
  },
  {
    eyebrow: 'One More Thing',
    title: 'Sharing One Screen',
    body: (
      <>
        <p>This game is built for everyone to play on <strong>one laptop</strong>, passing it around — so a couple of things exist just for that:</p>
        <ul className="htp-list">
          <li>Each player picks a private <strong>2-digit PIN</strong> at the start. Only your own PIN unlocks your development cards, so nobody else can peek.</li>
          <li>When a turn ends, a &ldquo;pass the laptop&rdquo; screen appears before the next player&rsquo;s hand is shown.</li>
        </ul>
        <p>Everything else — resources, dice, the board — plays exactly like the real tabletop game. Have fun!</p>
      </>
    ),
  },
];

/**
 * A short, plain-English walkthrough of the rules, built for players who have
 * never touched Catan before. Deliberately just data + step navigation — no
 * routing, no new assets, reusing the same emoji already used throughout the
 * live game so the guide and the game always look like the same product.
 */
export function HowToPlayModal({ onClose }: HowToPlayModalProps) {
  const [step, setStep] = useState(0);
  const section = SECTIONS[step];
  const isFirst = step === 0;
  const isLast = step === SECTIONS.length - 1;

  return (
    <div className="modal-backdrop how-to-play-backdrop" onClick={onClose}>
      <div className="how-to-play" onClick={(e) => e.stopPropagation()}>
        <header className="how-to-play__header">
          <h2>How to Play</h2>
          <button type="button" className="trade-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <nav className="how-to-play__tabs" aria-label="Sections">
          {SECTIONS.map((s, i) => (
            <button
              key={s.title}
              type="button"
              className={`how-to-play__tab${i === step ? ' how-to-play__tab--active' : ''}`}
              onClick={() => setStep(i)}
            >
              {s.title}
            </button>
          ))}
        </nav>

        <div className="how-to-play__content">
          <p className="how-to-play__eyebrow">{section.eyebrow}</p>
          <h3 className="how-to-play__title">{section.title}</h3>
          <div className="how-to-play__body">{section.body}</div>
        </div>

        <footer className="how-to-play__footer">
          <div className="how-to-play__dots">
            {SECTIONS.map((s, i) => (
              <span
                key={s.title}
                className={`how-to-play__dot${i === step ? ' how-to-play__dot--active' : ''}`}
              />
            ))}
          </div>
          <div className="how-to-play__nav">
            <button type="button" className="btn btn--ghost" disabled={isFirst} onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
            {isLast ? (
              <button type="button" className="btn btn--primary" onClick={onClose}>
                Let&rsquo;s Play
              </button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={() => setStep((s) => s + 1)}>
                Next
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
