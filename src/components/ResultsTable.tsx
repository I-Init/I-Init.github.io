import clsx from 'clsx';
import type { ReactNode } from 'react';

import type { ResultTableData } from '@/data/results';

type ResultsTableProps = {
  idx: string;
  title: string;
  caption: ReactNode;
  data: ResultTableData;
};

export default function ResultsTable({ idx, title, caption, data }: ResultsTableProps) {
  const { lead, leadGroup, columns, groups, cellClassName } = data;
  const subColumns = columns.flatMap((column, c) => (column.sub ?? [null]).map((label, s) => ({ label, startsGroup: s === 0, key: `${c}-${s}` })));
  const groupRule = 'border-l border-gray-200';

  return (
    <figure>
      {/* Wide tables scroll sideways on narrow screens; the first column stays in view. */}
      <div
        role='region'
        aria-label={`Table ${idx}. ${title}`}
        tabIndex={0}
        className='overflow-x-auto rounded-md border border-gray-200 bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600'
      >
        <table className='w-full min-w-max border-collapse text-sm tabular-nums md:text-[0.9375rem]'>
          <thead className='text-gray-800'>
            <tr>
              {leadGroup ? (
                <th colSpan={lead.length} scope='colgroup' className='px-3 pb-1 pt-2 text-center font-semibold'>{leadGroup}</th>
              ) : (
                lead.map((label, l) => (
                  <th key={l} rowSpan={2} scope='col' className={clsx('px-3 py-2 text-left font-semibold', l === 0 && 'sticky left-0 z-10 bg-white')}>{label}</th>
                ))
              )}
              {columns.map((column, c) => (
                <th
                  key={c}
                  rowSpan={column.sub ? 1 : 2}
                  colSpan={column.sub?.length ?? 1}
                  scope={column.sub ? 'colgroup' : 'col'}
                  className={clsx('px-3 pb-1 pt-2 text-center font-semibold', groupRule)}
                >
                  {column.label}
                </th>
              ))}
            </tr>
            <tr>
              {leadGroup && lead.map((label, l) => (
                <th key={l} scope='col' className='px-3 pb-2 text-center font-medium text-gray-600'>{label}</th>
              ))}
              {subColumns.filter(({ label }) => label !== null).map(({ label, startsGroup, key }) => (
                <th key={key} scope='col' className={clsx('whitespace-nowrap px-3 pb-2 text-right text-xs font-medium text-gray-600 md:text-sm', startsGroup && groupRule)}>{label}</th>
              ))}
            </tr>
          </thead>
          {groups.map((group, g) => (
            <tbody key={g} className='border-t border-gray-300'>
              {group.title && (
                <tr>
                  <th colSpan={lead.length + subColumns.length} scope='colgroup' className='px-3 pb-1 pt-3 text-left text-sm font-normal italic text-gray-500 md:text-base'>
                    <span className='sticky left-3 inline-block max-w-[calc(100vw-5rem)]'>{group.title}</span>
                  </th>
                </tr>
              )}
              {group.rows.map((row, r) => (
                <tr key={r} className={clsx(row.ours && 'bg-primary-50')}>
                  {row.lead.map((label, l) => (
                    <td
                      key={l}
                      className={clsx(
                        'whitespace-nowrap px-3 py-1.5',
                        leadGroup ? 'text-center' : 'text-left',
                        l === 0 && 'sticky left-0 z-10',
                        l === 0 && (row.ours ? 'bg-primary-50 font-semibold text-gray-800' : 'bg-white')
                      )}
                    >
                      {label}
                    </td>
                  ))}
                  {row.cells.map((value, c) => {
                    const best = value.endsWith('*');
                    const text = best ? value.slice(0, -1) : value;
                    return (
                      <td
                        key={c}
                        className={clsx(
                          'px-3 py-1.5 text-right',
                          subColumns[c].startsGroup && groupRule,
                          best && 'font-bold text-gray-900',
                          cellClassName?.(text, c)
                        )}
                      >
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <figcaption className='figure-caption'>
        <strong>Table {idx}. {title}.</strong> {caption}
      </figcaption>
    </figure>
  );
}
