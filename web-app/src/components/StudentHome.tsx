import React from 'react'

interface Props {
  onRegister: () => void
  onScan: () => void
  onBack?: () => void  // optional — hidden when accessed via /students on web
}

export default function StudentHome({ onRegister, onScan, onBack }: Props) {
  return (
    <>
      <div className="home-bg" />
      <div className="home-content">
        <div className="logo-ring">
          <img src="/photo_2.webp" alt="ACLC Ormoc" />
        </div>
        <div className="home-uni">ACLC College Ormoc</div>
        <div className="home-college">College of Computer Studies</div>
        <div className="home-title">Attendance<br />Scanner</div>
        <div className="home-sub" style={{ marginBottom: 32 }}>
          Register your device once, then scan QR codes to log attendance.
        </div>
        <div className="home-btns">
          <button className="btn-primary" onClick={onScan}>
            📷 Scan Attendance
          </button>
          <button
            className="btn-primary"
            onClick={onRegister}
            style={{ marginTop: 12, background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.3)' }}
          >
            📱 Register My Device
          </button>
          {onBack && (
            <button
              className="btn-primary"
              onClick={onBack}
              style={{ marginTop: 12, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}
            >
              ← Back
            </button>
          )}
        </div>
        {!onBack && (
          <div style={{ marginTop: 32, color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center' }}>
            Teacher?{' '}
            <a href="/" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'underline' }}>
              Go to teacher login
            </a>
          </div>
        )}
      </div>
    </>
  )
}
