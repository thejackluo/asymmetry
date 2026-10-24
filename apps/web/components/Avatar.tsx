const avatarColors = [
  '#0a84ff',
  '#6d5ce8',
  '#0891b2',
  '#be5b32',
  '#b33c73',
  '#427a54',
];

export default function Avatar({
  name,
  size = 'md',
}: {
  name: string;
  size?: 'sm' | 'md';
}) {
  const label = name.replace(/['’]s\s+Agent$/i, '').trim();
  const hash = Array.from(label).reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${
        size === 'sm' ? 'size-8 text-xs' : 'size-10 text-sm'
      }`}
      style={{ backgroundColor: avatarColors[hash % avatarColors.length] }}
    >
      {label.charAt(0).toUpperCase() || '?'}
    </span>
  );
}
