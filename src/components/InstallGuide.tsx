import { useState, useEffect } from 'react';

// Et simpelt hook eller komponent til at vise en guide for iOS brugere
export default function InstallGuide() {
    const [showGuide, setShowGuide] = useState(false);

    useEffect(() => {
        // Tjek om vi er på iOS (Safari/Chrome)
        const isIos = () => {
            const userAgent = window.navigator.userAgent.toLowerCase();
            return /iphone|ipad|ipod/.test(userAgent);
        };

        // Tjek om appen allerede kører som en installeret PWA ("standalone")
        const isInStandaloneMode = () => {
            return (
                window.matchMedia('(display-mode: standalone)').matches ||
                // @ts-ignore - specifik fallback for ældre iOS
                (window.navigator.standalone === true)
            );
        };

        if (isIos() && !isInStandaloneMode()) {
            setShowGuide(true);
        }
    }, []);

    if (!showGuide) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '90px', // Placer lige over BottomNav
            left: '5%',
            right: '5%',
            background: 'white',
            padding: '16px',
            borderRadius: '16px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            border: '2px solid var(--primary)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h4 style={{ margin: 0, color: 'var(--text)' }}>Installér handl.</h4>
                <button
                    onClick={() => setShowGuide(false)}
                    style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '0 8px', color: '#999' }}
                >
                    ✕
                </button>
            </div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#666', lineHeight: 1.4 }}>
                Få den fulde app-oplevelse: Tryk på <strong>Del</strong>-ikonet <svg style={{ display: 'inline-block', verticalAlign: 'middle', width: '18px', height: '18px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg> i bunden af skærmen og vælg <strong style={{ color: 'var(--primary)' }}>"Føj til hjemmeskærm"</strong>.
            </p>
        </div>
    );
}
