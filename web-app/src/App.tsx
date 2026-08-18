import React, { useState, useEffect } from 'react'
import HomeScreen from './components/HomeScreen'
import StudentHome from './components/StudentHome'
import PINGate from './components/PINGate'
import StudentScanner from './components/StudentScanner'
import RegisterDevice from './components/RegisterDevice'
import TeacherLogin from './components/TeacherLogin'
import TeacherSession from './components/TeacherSession'

import { supabase } from './services/supabase'
import './App.css'

type Phase = 'home' | 'student-home' | 'pin' | 'scanner' | 'register' | 'teacher-login' | 'teacher'

// /students URL → web-only student landing page
// Capacitor (localhost) or / → full home with both buttons
const IS_STUDENTS_ROUTE = window.location.pathname.startsWith('/students')

export default function App() {
  const [phase, setPhase] = useState<Phase>(IS_STUDENTS_ROUTE ? 'student-home' : 'home')
  const [pinValue, setPinValue] = useState('')
  const [navCount, setNavCount] = useState(0)

  useEffect(() => {
    if (IS_STUDENTS_ROUTE) return
    supabase().auth.getSession().then(({ data: { session } }) => {
      if (session) setPhase('teacher')
    }).catch(() => {})
  }, [])

  function go(id: Phase) { setNavCount(c => c + 1); setPhase(id); window.scrollTo(0, 0) }

  async function handleSelectTeacher() {
    const { data: { session } } = await supabase().auth.getSession()
    go(session ? 'teacher' : 'teacher-login')
  }

  const backHome: Phase = IS_STUDENTS_ROUTE ? 'student-home' : 'home'

  return (
    <div className="app">

      {/* Main home — shown in the app AND on / — has both teacher + student buttons */}
      {!IS_STUDENTS_ROUTE && (
        <div className={`screen ${phase === 'home' ? 'active' : ''}`} id="home">
          <HomeScreen
            onSelectTeacher={handleSelectTeacher}
            onSelectStudent={() => go('student-home')}
          />
        </div>
      )}

      {/* Student landing — /students on web OR tapped "I'm a Student" in the app */}
      <div className={`screen ${phase === 'student-home' ? 'active' : ''}`} id="student-home">
        <StudentHome
          onScan={() => go('pin')}
          onRegister={() => go('register')}
          onBack={IS_STUDENTS_ROUTE ? undefined : () => go('home')}
        />
      </div>

      {/* Register device */}
      <div className={`screen ${phase === 'register' ? 'active' : ''}`} id="register">
        <RegisterDevice
          key={navCount}
          onBack={() => go(backHome)}
          onRegistered={(pin) => { setPinValue(pin); go('scanner') }}
        />
      </div>

      {/* PIN gate */}
      <div className={`screen ${phase === 'pin' ? 'active' : ''}`} id="pin">
        <PINGate key={navCount} onSuccess={(pin) => { setPinValue(pin); go('scanner') }} onBack={() => go(backHome)} />
      </div>

      {/* QR Scanner */}
      <div className={`screen ${phase === 'scanner' ? 'active' : ''}`} id="scanner">
        <StudentScanner key={navCount} onBack={() => go(backHome)} pinValue={pinValue} onProximity={() => go(backHome)} />
      </div>

      {/* Teacher login */}
      <div className={`screen ${phase === 'teacher-login' ? 'active' : ''}`} id="teacher-login">
        <TeacherLogin onLogin={() => go('teacher')} onBack={() => go('home')} />
      </div>

      {/* Teacher dashboard */}
      <div className={`screen ${phase === 'teacher' ? 'active' : ''}`} id="teacher-dash">
        <TeacherSession onLogout={() => go('home')} />
      </div>

    </div>
  )
}
