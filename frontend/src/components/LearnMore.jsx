import { Shield, KeyRound, HardDrive, Lock, Smartphone, UserCheck } from 'lucide-react';
import AppHeader from './AppHeader';

export default function LearnMore() {
  const points = [
    {
      icon: <Smartphone className="w-6 h-6 text-emerald-400" />,
      title: 'No Phone Number Required',
      body: 'Unlike traditional chat apps, DriveChat only requires your Google account. No SMS verification, no SIM card, and no sharing your phone number.',
    },
    {
      icon: <UserCheck className="w-6 h-6 text-blue-400" />,
      title: 'Personal Sync Workspace',
      body: 'DriveChat is designed for you to chat with yourself. It’s a secure bridge to sync notes, links, and files across your own devices instantly.',
    },
    {
      icon: <Shield className="w-6 h-6 text-amber-400" />,
      title: 'End-to-End Encrypted',
      body: 'Your data is encrypted on your device using your own password. We never see your password or your unencrypted messages.',
    },
    {
      icon: <HardDrive className="w-6 h-6 text-purple-400" />,
      title: 'Your Drive, Your Data',
      body: 'All files are stored in your own Google Drive. You maintain 100% ownership and can access them even without DriveChat.',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <AppHeader />

      <main className="flex-1 w-full py-12">
        <div className="max-w-5xl mx-auto px-4 space-y-10">
          <section className="text-center space-y-3">
            <p className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-sm font-semibold">
              Private • Secure • No Phone Required
            </p>
            <h1 className="text-4xl md:text-5xl font-display font-bold bg-linear-to-r from-[#1a73e8] via-[#f9ab00] to-[#ea4335] bg-clip-text text-transparent">
              Your Personal Secure Bridge
            </h1>
            <p className="text-gray-400 text-lg max-w-3xl mx-auto">
              DriveChat is a private workspace for syncing your life across devices. No social
              features, no tracking—just your data, secured by your keys, stored in your Drive.
            </p>
          </section>

          <section className="grid md:grid-cols-2 gap-6">
            {points.map((item) => (
              <div
                key={item.title}
                className="p-6 rounded-xl border border-gray-800 bg-gray-900/60 hover:border-blue-500/40 transition-colors space-y-3"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gray-800">{item.icon}</div>
                  <h3 className="text-xl font-semibold">{item.title}</h3>
                </div>
                <p className="text-gray-300 text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-blue-500/30 bg-linear-to-r from-blue-500/10 to-purple-500/10 p-8 space-y-4">
            <h2 className="text-2xl font-bold">If you lose your password</h2>
            <ul className="list-disc list-inside text-gray-200 space-y-2">
              <li>We cannot reset or recover it—only you know it.</li>
              <li>Existing messages stay encrypted and unreadable without the password.</li>
              <li>Your Google Drive files remain intact in the DriveChat folder.</li>
              <li>
                To continue, delete your DriveChat account, sign in again, and set a new password.
              </li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
