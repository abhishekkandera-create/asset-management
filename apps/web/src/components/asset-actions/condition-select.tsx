import { CONDITION_GRADES, type ConditionGrade } from '@asset/shared';
import { conditionLabel } from '@/components/condition-badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ConditionSelectProps {
  id: string;
  label: string;
  value: ConditionGrade | '';
  onChange: (value: ConditionGrade) => void;
  hint?: string;
}

/** Condition is mandatory at both issue and return (CLAUDE.md §7.3). */
export function ConditionSelect({
  id,
  label,
  value,
  onChange,
  hint,
}: ConditionSelectProps): JSX.Element {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(next) => onChange(next as ConditionGrade)}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select a condition" />
        </SelectTrigger>
        <SelectContent>
          {CONDITION_GRADES.map((grade) => (
            <SelectItem key={grade} value={grade}>
              {conditionLabel(grade)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
