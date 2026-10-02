"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

type TableScrollProps = {
  children: ReactNode;
  className?: string;
};

export default function TableScroll({ children, className = '' }: TableScrollProps) {
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);

  const syncFromTop = useCallback(() => {
    const topScroll = topScrollRef.current;
    const tableScroll = tableScrollRef.current;
    if (topScroll && tableScroll && tableScroll.scrollLeft !== topScroll.scrollLeft) {
      tableScroll.scrollLeft = topScroll.scrollLeft;
    }
  }, []);

  const syncFromTable = useCallback(() => {
    const topScroll = topScrollRef.current;
    const tableScroll = tableScrollRef.current;
    if (topScroll && tableScroll && topScroll.scrollLeft !== tableScroll.scrollLeft) {
      topScroll.scrollLeft = tableScroll.scrollLeft;
    }
  }, []);

  useEffect(() => {
    const tableScroll = tableScrollRef.current;
    if (!tableScroll) return;

    const updateDimensions = () => {
      const table = tableScroll.querySelector('table');
      setTableWidth(table?.scrollWidth ?? 0);
      setViewportWidth(tableScroll.clientWidth);
    };

    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    observer.observe(tableScroll);
    const table = tableScroll.querySelector('table');
    if (table) observer.observe(table);

    return () => observer.disconnect();
  }, [children]);

  const hasHorizontalOverflow = tableWidth > viewportWidth + 1;

  return (
    <div className={`table-scroll ${className}`.trim()}>
      {hasHorizontalOverflow && (
        <div
          className="table-scroll-top"
          ref={topScrollRef}
          onScroll={syncFromTop}
          role="region"
          aria-label="Scroll table horizontally"
          tabIndex={0}
        >
          <div className="table-scroll-spacer" style={{ width: tableWidth }} />
        </div>
      )}
      <div className="tablebox" ref={tableScrollRef} onScroll={syncFromTable}>
        {children}
      </div>
    </div>
  );
}
