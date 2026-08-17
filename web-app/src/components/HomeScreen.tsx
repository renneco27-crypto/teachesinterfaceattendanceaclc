import React from 'react'

interface Props {
  onSelectRole: (role: 'teacher') => void
}

const TeacherIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M2 3h20m-1 0v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3m4 18l5-5l5 5" />
    </g>
  </svg>
)

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
          <button className="btn-primary" onClick={() => onSelectRole('teacher')}>{TeacherIcon} I'm a Teacher</button>
        </div>
      </div>
    </>
  )
}
