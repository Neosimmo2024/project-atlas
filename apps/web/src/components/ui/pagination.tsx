import Link from "next/link";

type PaginationProps = {
  page: number;
  pageCount: number;
  total: number;
  hrefForPage: (page: number) => string;
  label?: string;
};

export function Pagination({ page, pageCount, total, hrefForPage, label = "Pagination" }: PaginationProps) {
  if (pageCount <= 1) return null;
  return (
    <nav className="pagination" aria-label={label}>
      <span>{total} resultat(s)</span>
      <div>
        {page > 1 ? <Link className="button subtle-button" href={hrefForPage(page - 1)}>Precedent</Link> : null}
        <span>Page {page} / {pageCount}</span>
        {page < pageCount ? <Link className="button subtle-button" href={hrefForPage(page + 1)}>Suivant</Link> : null}
      </div>
    </nav>
  );
}
