import { useEffect, useState } from 'react';
import { Cloud } from 'lucide-react';
import NameInput from './components/NameInput';
import Dropzone from './components/Dropzone';
import Leaderboard from './components/Leaderboard';

const NAME_STORAGE_KEY = 'photo-uploader-name';

export default function App() {
  const [name, setName] = useState(() => localStorage.getItem(NAME_STORAGE_KEY) ?? '');
  const [refreshSignal, setRefreshSignal] = useState(0);

  useEffect(() => {
    localStorage.setItem(NAME_STORAGE_KEY, name);
  }, [name]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#2e1065,_#0b0712_60%)]">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center px-4 py-12">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-500 shadow-lg shadow-purple-900/40">
            <Cloud className="size-7 text-white" />
          </div>
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">Photo Drop</h1>
          <p className="mt-2 max-w-md text-sm text-gray-400">
            Upload your photos and they'll be organized into shared Drive folders by the date each photo was taken.
          </p>
        </div>

        <div className="w-full space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-xl shadow-black/20 backdrop-blur">
            <NameInput value={name} onChange={setName} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-xl shadow-black/20 backdrop-blur">
            <h2 className="mb-3 text-sm font-medium text-gray-300">Photos</h2>
            <Dropzone
              name={name}
              onUploaded={() => setRefreshSignal((s) => s + 1)}
              accept={{ 'image/*': [] }}
              kind="photo"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-xl shadow-black/20 backdrop-blur">
            <h2 className="mb-3 text-sm font-medium text-gray-300">Videos</h2>
            <Dropzone
              name={name}
              onUploaded={() => setRefreshSignal((s) => s + 1)}
              accept={{ 'video/mp4': ['.mp4'], 'video/quicktime': ['.mov'] }}
              kind="video"
            />
          </div>

          <Leaderboard refreshSignal={refreshSignal} />
        </div>

        <p className="mt-10 text-center text-xs text-gray-600">
          Photos are stored in a shared Google Drive. Please be respectful of others&apos; uploads.
        </p>
      </div>
    </div>
  );
}
