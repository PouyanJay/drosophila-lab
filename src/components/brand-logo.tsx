/** Approved Neural Fly mark. Keep this asset shared across every app surface. */
export default function BrandLogo({
  size = 30,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/brand/neural-fly.svg"
      width={size}
      height={size}
      className={'brand-logo ' + className}
      alt=""
      aria-hidden="true"
      style={{ width: size, height: size, flexShrink: 0, objectFit: 'contain' }}
    />
  );
}
