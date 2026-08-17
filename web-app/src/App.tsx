import React, { useState, useEffect } from 'react'
import HomeScreen from './components/HomeScreen'
import StudentHome from './components/StudentHome'
import PINGate from './components/PINGate'
import StudentScanner from './components/StudentScanner'
import StudentBLE from './components/StudentBLE'
import RegisterDevice from './components/RegisterDevice'
import TeacherLogin from './components/TeacherLogin'
import TeacherSession from './components/TeacherSession'

import { supabase } from './services/supabase'
import './App.css'

type TeacherPhase = 'home' | 'teacher-login' | 'teacher'
type StudentPhase = 'home' | 'pin' | 'scanner' | 'ble' | 'register'

function isStudentsPath() {
  return window.location.pathname.startsWith('/students')
}

export default function App() {
  const [teacherPhase, setTeacherPhase] = useState<TeacherPhase>('home')
  const [studentPhase, setStudentPhase] = useState<StudentPhase>('home')
  const [pinValue, setPinValue] = useState('')
  const [navCount, setNavCount] = useState(0)

  const isStudents = isStudentsPath()

  useEffect(() => {
    supabase().auth.getSession().then(({ data: { session } }) => {
      if (session) setTeacherPhase('teacher')
    }).catch(() => {})
  }, [])

  function goTeacher(id: TeacherPhase) { setNavCount(c => c + 1); setTeacherPhase(id); window.scrollTo(0, 0) }
  function goStudent(id: StudentPhase) { setNavCount(c => c + 1); setStudentPhase(id); window.scrollTo(0, 0) }
  async function handleSelectRole() {
    const { data: { session } } = await supabase().auth.getSession()
    goTeacher(session ? 'teacher' : 'teacher-login')
  }

  if (isStudents) {
    return (
      <div className="app">
        <div className={`screen ${studentPhase === 'home' ? 'active' : ''}`} id="students">
          <StudentHome onStudent={() => goStudent('pin')} onRegister={() => goStudent('register')} onTeacher={handleSelectRole} />
        </div>
        <div className={`screen ${studentPhase === 'pin' ? 'active' : ''}`} id="pin">
          <PINGate key={navCount} onSuccess={(pin) => { setPinValue(pin); goStudent('scanner') }} onBack={() => goStudent('home')} />
        </div>
        <div className={`screen ${studentPhase === 'register' ? 'active' : ''}`} id="register">
          <RegisterDevice key={navCount} onBack={() => goStudent('home')} />
        </div>
        <div className={`screen ${studentPhase === 'scanner' ? 'active' : ''}`} id="scanner">
          <StudentScanner key={navCount} onBack={() => goStudent('home')} onBle={() => goStudent('ble')} pinValue={pinValue} />
        </div>
        <div className={`screen ${studentPhase === 'ble' ? 'active' : ''}`} id="ble">
          <StudentBLE key={navCount} onBack={() => goStudent('home')} pinValue={pinValue} />
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className={`screen ${teacherPhase === 'home' ? 'active' : ''}`} id="home">
        <HomeScreen onSelectRole={handleSelectRole} />
      </div>
      <div className={`screen ${teacherPhase === 'teacher-login' ? 'active' : ''}`} id="teacher-login">
        <TeacherLogin onLogin={() => goTeacher('teacher')} onBack={() => goTeacher('home')} />
      </div>
      <div className={`screen ${teacherPhase === 'teacher' ? 'active' : ''}`} id="teacher-dash">
        <TeacherSession onLogout={() => goTeacher('home')} />
      </div>
    </div>
  )
}
