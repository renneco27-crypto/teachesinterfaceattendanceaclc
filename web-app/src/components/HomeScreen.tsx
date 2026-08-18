import React from 'react'

interface Props {
  onSelectTeacher: () => void
  onSelectStudent: () => void
}

export default function HomeScreen({ onSelectTeacher, onSelectStudent }: Props) {
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
        <div className="home-sub">Scan your QR code to log attendance instantly. Built for students and teachers at ACLC Ormoc.</div>
        <div className="home-btns">
          <button className="btn-primary" onClick={onSelectStudent}>
            🎓 I'm a Student
          </button>
          <button
            className="btn-primary"
            onClick={onSelectTeacher}
            style={{ marginTop: 12, background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.3)' }}
          >
            🔐 I'm a Teacher
          </button>
        </div>
      </div>
    </>
  )
}
