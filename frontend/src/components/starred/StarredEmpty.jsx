import { Star } from 'lucide-react';

export default function StarredEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-500">
      <Star className="w-16 h-16 mb-4 opacity-50" />
      <p className="text-lg font-medium">No starred messages</p>
      <p className="text-sm">Star important messages to keep them here</p>
    </div>
  );
}
