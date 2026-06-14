import { User } from 'lucide-react';

interface NameInputProps {
  value: string;
  onChange: (value: string) => void;
}

export default function NameInput({ value, onChange }: NameInputProps) {
  return (
    <div className="w-full">
      <label htmlFor="uploader-name" className="mb-2 block text-sm font-medium text-gray-300">
        Your name
      </label>
      <div className="relative">
        <User className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-gray-500" />
        <input
          id="uploader-name"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Partha"
          className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-gray-100 placeholder-gray-500 outline-none transition focus:border-purple-400/60 focus:ring-2 focus:ring-purple-400/30"
        />
      </div>
    </div>
  );
}
