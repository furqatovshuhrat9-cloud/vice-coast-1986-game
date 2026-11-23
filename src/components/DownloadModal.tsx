import React, { useState } from 'react';
import {
  Check,
  Download,
  ExternalLink,
  FileCode2,
  FileJson,
  Smartphone,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { soundEngine } from '../game/audio';

interface DownloadModalProps {
  open: boolean;
  onClose: () => void;
  onDownloadOfflineHtml: () => void;
  onExportWorldJson: () => void;
}

export const DownloadModal: React.FC<DownloadModalProps> = ({
  open,
  onClose,
  onDownloadOfflineHtml,
  onExportWorldJson,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [downloadedHtml, setDownloadedHtml] = useState(false);
  const [downloadedWorld, setDownloadedWorld] = useState(false);

  if (!open) return null;

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  const handleInstall = async () => {
    soundEngine.playClick();
    await install();
  };

  const handleHtml = () => {
    soundEngine.playClick();
    onDownloadOfflineHtml();
    setDownloadedHtml(true);
    setTimeout(() => setDownloadedHtml(false), 2500);
  };

  const handleWorld = () => {
    soundEngine.playClick();
    onExportWorldJson();
    setDownloadedWorld(true);
    setTimeout(() => setDownloadedWorld(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="mc-panel max-h-[92vh] w-full max-w-lg overflow-y-auto p-5 text-white shadow-2xl sm:p-6">
        <div className="flex items-center justify-between border-b border-white/15 pb-4">
          <div className="flex items-center gap-3">
            <Download className="h-5 w-5 text-emerald-400" />
            <h2 className="font-display text-lg font-bold tracking-wide sm:text-xl">
              Ilova va Oflayn Yuklab Olish
            </h2>
          </div>
          <button
            onClick={() => {
              soundEngine.playClick();
              onClose();
            }}
            aria-label="Yopish"
            className="mc-button p-2 text-white/80 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3.5">
          {/* 1. Mobile & Desktop PWA App Installation */}
          <div className="border border-sky-400/25 bg-[#161c20] p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-2 font-semibold text-sky-300">
                  <Smartphone className="h-4 w-4 shrink-0" />
                  <span>Telefon / Kompyuterga Ilova Qilib O&apos;rnatish</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                  {isInstalled
                    ? "CraftWorld qurilmangizga alohida ilova sifatida o'rnatilgan va internetsiz ishlaydi."
                    : isIOS
                      ? "iPhone/iPad: Safari pastidagi Ulashish (Share) tugmasini bosing va 'Add to Home Screen' ni tanlang."
                      : isInstallable
                        ? "Bitta bosish bilan telefon bosh ekraniga yoki kompyuter ish stoliga haqiqiy ilova sifatida o'rnating."
                        : isInIframe
                          ? "Brauzerning ilova o'rnatish oynasini ochish uchun avval 'To'liq Oynada Ochish' ni bosing, so'ngra Chrome menyusidan 'O'rnatish / Install' ni tanlang."
                          : "Brauzer manzil qatoridagi O'rnatish (Install) belgisi yoki menyudagi 'Add to Home screen' tugmasi orqali o'rnating."}
                </p>
              </div>

              {isInstalled ? (
                <span className="shrink-0 text-xs font-semibold text-emerald-400 whitespace-nowrap">
                  O&apos;rnatilgan
                </span>
              ) : isInstallable ? (
                <button
                  onClick={handleInstall}
                  className="mc-button mc-button-primary flex shrink-0 items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold whitespace-nowrap cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span>Ilovani O&apos;rnatish</span>
                </button>
              ) : (
                <a
                  href={typeof window !== 'undefined' ? window.location.href : '/'}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => soundEngine.playClick()}
                  className="mc-button mc-button-primary flex shrink-0 items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white no-underline whitespace-nowrap"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>To&apos;liq Oynada Ochish</span>
                </a>
              )}
            </div>
          </div>

          {/* 2. Standalone Textured Offline HTML */}
          <div className="border border-white/15 bg-[#1a1e1a] p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-2 font-semibold text-emerald-300">
                  <FileCode2 className="h-4 w-4 shrink-0" />
                  <span>Oflayn O&apos;yin Faylini Yuklab Olish (.html)</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                  Teksturasi, daraxtlari, telefonda joystigi va joriy dunyongiz bilan bitta mustaqil fayl. Yuklab olib internetsiz ham ochib o&apos;ynashingiz mumkin.
                </p>
              </div>
              <button
                onClick={handleHtml}
                className="mc-button mc-button-primary flex shrink-0 items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                {downloadedHtml ? <Check className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                <span>{downloadedHtml ? 'Yuklandi!' : 'Faylni Yuklash'}</span>
              </button>
            </div>
          </div>

          {/* 3. World Save Export */}
          <div className="border border-white/15 bg-[#1a1e1a] p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-2 font-semibold text-amber-300">
                  <FileJson className="h-4 w-4 shrink-0" />
                  <span>Dunyo Saqlash Fayli (.mcworld.json)</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                  Qurgan binolaringiz va inventaringizni faylga saqlab oling va boshqa qurilmaga o&apos;tkazing.
                </p>
              </div>
              <button
                onClick={handleWorld}
                className="mc-button flex shrink-0 items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                {downloadedWorld ? <Check className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                <span>{downloadedWorld ? 'Saqlandi!' : 'Saqlash'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
