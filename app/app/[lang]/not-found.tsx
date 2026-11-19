import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="or-wrap or-page">
      <div className="or-head"><h1>Not in the atlas · 지도에 없는 페이지입니다</h1>
        <p className="or-lede">The page may have moved in a monthly release. <Link href="/en">Back to the grove</Link> · <Link href="/ko">숲으로 돌아가기</Link></p></div>
    </div>
  );
}
