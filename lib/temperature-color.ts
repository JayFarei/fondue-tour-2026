// Visual comfort scale requested for the roadbook, not a medical heat-risk scale.
export function temperatureColor(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '#8b918e';
  if (value < 18) {
    const cold = Math.min(1, (18 - value) / 28);
    return `hsl(${205 + cold * 20} ${60 + cold * 30}% ${62 - cold * 35}%)`;
  }
  if (value > 22) {
    const heat = Math.min(1, (value - 22) / 13);
    return `hsl(${8 - heat * 8} ${72 + heat * 18}% ${68 - heat * 30}%)`;
  }
  return '#64766f';
}
