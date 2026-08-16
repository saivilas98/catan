interface DieProps {
  value: number | null;
  rolling: boolean;
}

// Pip layouts per face, on a 3x3 grid (col,row from 0..2).
const PIP_LAYOUT: Record<number, Array<[number, number]>> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

export function Die({ value, rolling }: DieProps) {
  const pips = value ? PIP_LAYOUT[value] ?? [] : [];

  return (
    <div className={`die${rolling ? ' die--rolling' : ''}`} aria-label={value ? `Die showing ${value}` : 'Die not rolled'}>
      {value === null ? (
        <span className="die__placeholder">?</span>
      ) : (
        <div className="die__grid">
          {pips.map(([col, row], i) => (
            <span
              key={i}
              className="die__pip"
              style={{ gridColumn: col + 1, gridRow: row + 1 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
