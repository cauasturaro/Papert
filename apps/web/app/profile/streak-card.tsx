import { FlameIcon } from "@/components/icons";
import { Card } from "@/components/ui/card/card";
import { cn } from "@/lib/utils";
import type { Engagement } from "./engagement-api";
import { STREAK_RULE, dayLabel, streakMessage } from "./engagement-state";
import { TimeZoneField } from "./time-zone-field";

type StreakCardProps = {
  engagement: Engagement;
  saving: boolean;
  error: string | null;
  onChooseTimeZone: (zone: string) => Promise<unknown>;
};

export function StreakCard({
  engagement,
  saving,
  error,
  onChooseTimeZone,
}: StreakCardProps) {
  const { streak, today } = engagement;
  const active = streak.current > 0;

  return (
    <Card className="space-y-5 p-4 sm:p-6" aria-labelledby="streak-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 id="streak-title" className="text-sm font-medium">
            Study streak
          </h2>
          <p className="flex items-baseline gap-2">
            <FlameIcon
              className={cn(
                "size-6 self-center",
                active ? "text-ring" : "text-muted-foreground",
              )}
            />
            <span className="text-4xl font-semibold tabular-nums">
              {streak.current}
            </span>
            <span className="text-sm text-muted-foreground">
              {streak.current === 1 ? "day" : "days"} in a row
            </span>
          </p>
        </div>

        <dl className="text-right text-sm">
          <dt className="text-muted-foreground">Longest streak</dt>
          <dd className="font-medium tabular-nums">
            {streak.longest} {streak.longest === 1 ? "day" : "days"}
          </dd>
        </dl>
      </div>

      <p role="status" className="text-sm">
        {streakMessage(streak)}
      </p>

      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          Last 14 days
        </h3>
        <ol aria-label="Study days in the last 14 days" className="flex gap-1">
          {streak.recent.map((item) => {
            const label = `${dayLabel(item.day)}: ${item.studied ? "studied" : "no analysis"}`;

            return (
              <li
                key={item.day}
                aria-label={label}
                title={label}
                aria-current={item.day === today ? "date" : undefined}
                className={cn(
                  "h-6 min-w-0 flex-1 rounded-sm border",
                  item.studied
                    ? "border-ring bg-primary"
                    : "border-border bg-muted",
                  item.day === today &&
                    "ring-2 ring-ring ring-offset-1 ring-offset-card",
                )}
              />
            );
          })}
        </ol>
        <p className="flex justify-between text-xs text-muted-foreground">
          <span>{dayLabel(streak.recent[0]?.day ?? today)}</span>
          <span>Today</span>
        </p>
      </div>

      <p className="text-xs text-muted-foreground">{STREAK_RULE}</p>

      <TimeZoneField
        timeZone={engagement.timeZone}
        timeZoneSet={engagement.timeZoneSet}
        saving={saving}
        error={error}
        onChoose={onChooseTimeZone}
      />
    </Card>
  );
}
