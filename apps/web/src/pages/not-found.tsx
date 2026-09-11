import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';

export function NotFoundPage(): JSX.Element {
  return (
    <div className="mx-auto max-w-xl py-16">
      <EmptyState
        icon={FileQuestion}
        title="Page not found"
        description="That screen does not exist, or it arrives in a later build phase."
        action={
          <Button asChild>
            <Link to="/">Back to the dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}
