import React from 'react'

interface Props {
  onStudent: () => void
  onRegister: () => void
  onTeacher: () => void
}

const StudentIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path fill="currentColor" d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
      <path d="M22 10v6" />
      <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
    </g>
  </svg>
)

const RegisterIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path fill="currentColor" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle fill="currentColor" cx="9" cy="7" r="4" />
      <path fill="currentColor" d="M19 8v6m3-3h-6" />
    </g>
  </svg>
)

const TeacherIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M2 3h20m-1 0v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3m4 18l5-5l5 5" />
    </g>
  </svg>
)

export default function StudentHome({ onStudent, onRegister, onTeacher }: Props) {
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
          <button className="btn-white-ghost" onClick={onStudent}>{StudentIcon} I'm a Student</button>
          <button className="home-register-btn" onClick={onRegister}>{RegisterIcon} Register Device</button>
          <button className="btn-primary" onClick={onTeacher}>{TeacherIcon} I'm a Teacher</button>
        </div>
      </div>
    </>
  )
}
