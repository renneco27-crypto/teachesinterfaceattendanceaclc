import React from 'react'

interface Props {
  onSelectRole: (role: 'teacher') => void
}

export default function HomeScreen({ onSelectRole }: Props) {
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
          <button className="btn-primary" onClick={() => onSelectRole('teacher')}>🔐 I'm a Teacher</button>
        </div>
      </div>
    </>
  )
}
