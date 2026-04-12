interface SparklineProps {
  data: (number | null)[];
  width?: number;
  height?: number;
}

export function Sparkline({ data, width = 80, height = 24 }: SparklineProps) {
  const validData = data.filter((d): d is number => d !== null);
  if (validData.length < 2) return <div style={{ width, height }} />;

  const min = Math.min(...validData);
  const max = Math.max(...validData);
  const range = max - min || 1;

  // For positions, lower is better, so invert the Y axis
  const points = validData.map((v, i) => {
    const x = (i / (validData.length - 1)) * width;
    const y = ((v - min) / range) * (height - 4) + 2;
    return `${x},${y}`;
  }).join(" ");

  const firstVal = validData[0];
  const lastVal = validData[validData.length - 1];
  const color = lastVal <= firstVal ? "#10b981" : "#ef4444";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  );
}
