import Link from 'next/link';

export default function RegionNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-20 text-center">
      <h1
        className="text-3xl font-bold mb-4"
        style={{ color: 'var(--text-strong)' }}
      >
        지역을 찾을 수 없습니다
      </h1>
      <p className="mb-8" style={{ color: 'var(--text-muted)' }}>
        요청하신 지역 정보가 존재하지 않거나 이동되었습니다.
      </p>
      <Link
        href="/location-map"
        className="inline-flex items-center px-5 py-2.5 rounded-md text-white hover:opacity-90 transition-opacity motion-reduce:transition-none"
        style={{ backgroundColor: 'var(--text-strong)' }}
      >
        입지지도로 이동
      </Link>
    </main>
  );
}
