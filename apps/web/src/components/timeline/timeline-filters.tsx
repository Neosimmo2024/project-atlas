import { TIMELINE_FILTER_LABELS, type TimelineFilterCategory } from "@/features/timeline/options";

type TimelineFiltersProps = {
  category: string;
  hiddenFields: Record<string, string>;
};

export function TimelineFilters({ category, hiddenFields }: TimelineFiltersProps) {
  return (
    <form className="chronology-filters" action="">
      {Object.entries(hiddenFields).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
      {Object.entries(TIMELINE_FILTER_LABELS).map(([key, label]) => (
        <button className={category === key ? "button" : "button subtle-button"} key={key} name="timelineCategory" type="submit" value={key}>
          {label}
        </button>
      ))}
    </form>
  );
}

export function normalizeTimelineCategory(value: string): TimelineFilterCategory {
  return value in TIMELINE_FILTER_LABELS ? value as TimelineFilterCategory : "all";
}
