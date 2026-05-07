'use client';

import { useEffect } from 'react';

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 4000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center">
      <div className="bg-[#2C5F7C] text-white px-16 py-10">
        <h1 className="text-5xl font-bold text-center tracking-wider">
          CAXTON
        </h1>
        <h2 className="text-3xl font-bold text-center tracking-wide mt-2">
          PUBLICATIONS
        </h2>
      </div>
      
      <p className="text-gray-600 text-sm mt-8 italic">
        Putting A Face on Real Estate since 1995
      </p>
    </div>
  );
}
