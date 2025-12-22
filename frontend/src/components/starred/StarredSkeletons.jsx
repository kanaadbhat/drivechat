import Skeleton from '../ui/Skeleton';

export default function StarredSkeletons({ count = 6 }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[...Array(count)].map((_, idx) => (
        <div
          key={`starred-skel-${idx}`}
          className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3 animate-fade-in"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-6 rounded" />
          </div>
          <Skeleton className="h-32 w-full rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-gray-800">
            <Skeleton className="h-3 w-16" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-16 rounded" />
              <Skeleton className="h-8 w-12 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
