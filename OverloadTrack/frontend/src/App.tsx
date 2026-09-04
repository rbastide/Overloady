import { useState } from 'react'
import './App.css'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true);
  
  const [activeTab, setActiveTab] = useState('logger');

  // Dummy State for active workout
  const [workout, setWorkout] = useState([
    { id: 1, name: 'Bench Press', sets: [{ reps: 8, weight: 80 }, { reps: 8, weight: 80 }] },
    { id: 2, name: 'Squat', sets: [{ reps: 5, weight: 100 }] }
  ]);

  const addSet = (exerciseIndex: number) => {
    const newWorkout = [...workout];
    newWorkout[exerciseIndex].sets.push({ reps: 0, weight: 0 });
    setWorkout(newWorkout);
  };

  const updateSet = (eIndex: number, setIndex: number, field: 'reps' | 'weight', value: string) => {
    const newWorkout = [...workout];
    newWorkout[eIndex].sets[setIndex][field] = Number(value);
    setWorkout(newWorkout);
  }

  const addExercise = () => {
    setWorkout([...workout, { id: Date.now(), name: 'New Exercise', sets: [{ reps: 0, weight: 0 }] }]);
  }

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticated(true);
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-container">
        <div className="glass-panel auth-card">
          <div className="logo">
            <span>O</span>verloadTrack
          </div>
          <p>{isLoginMode ? 'Welcome back! Log in to continue.' : 'Create an account to start tracking.'}</p>
          
          <form onSubmit={handleAuthSubmit}>
            <div className="form-group">
              <label>Email Address</label>
              <input type="email" placeholder="alex@example.com" required />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" placeholder="••••••••" required />
            </div>
            
            <button type="submit" className="btn-neon" style={{ width: '100%', marginTop: '1rem' }}>
              {isLoginMode ? 'Log In' : 'Sign Up'}
            </button>
          </form>
          
          <div className="auth-toggle">
            {isLoginMode ? "Don't have an account?" : "Already have an account?"}
            <span onClick={() => setIsLoginMode(!isLoginMode)}>
              {isLoginMode ? 'Sign Up' : 'Log In'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const renderNavItems = (isMobile = false) => {
    const items = [
      { id: 'dashboard', label: 'Dashboard', icon: '📊' },
      { id: 'logger', label: 'Workout', icon: '🏋️' },
      { id: 'history', label: 'History', icon: '📅' },
      { id: 'exercises', label: 'Exercises', icon: '📋' },
      { id: 'profile', label: 'Profile', icon: '👤' },
    ];

    if (isMobile) {
      return items.map(item => (
        <div 
          key={item.id}
          className={`mobile-nav-item ${activeTab === item.id ? 'active' : ''}`}
          onClick={() => setActiveTab(item.id)}
        >
          <span style={{ fontSize: '1.25rem' }}>{item.icon}</span>
          <span>{item.label}</span>
        </div>
      ));
    }

    return items.map(item => (
      <div 
        key={item.id}
        className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
        onClick={() => setActiveTab(item.id)}
      >
        <span>{item.icon}</span> {item.label}
      </div>
    ));
  }

  return (
    <div className="app-container">
      {/* Sidebar for Desktop */}
      <aside className="sidebar">
        <div className="logo">
          <span>O</span>verloadTrack
        </div>
        <nav className="nav-links">
          {renderNavItems()}
        </nav>
        <div style={{ marginTop: 'auto' }}>
          <button 
            className="btn-icon" 
            style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem' }}
            onClick={() => setIsAuthenticated(false)}
          >
            <span>🚪</span> Log out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {activeTab === 'dashboard' && (
          <div>
            <div className="header">
              <h1>Welcome back, Alex!</h1>
              <p>Here is your overall progress.</p>
            </div>
            
            <div className="dashboard-grid">
              <div className="glass-panel stat-card">
                <h3>Workouts this week</h3>
                <div className="value">4 <span style={{fontSize: '1rem', color: 'var(--text-muted)'}}>sessions</span></div>
              </div>
              <div className="glass-panel stat-card">
                <h3>Total Volume</h3>
                <div className="value">12,450 <span style={{fontSize: '1rem', color: 'var(--text-muted)'}}>kg</span></div>
              </div>
              <div className="glass-panel stat-card">
                <h3>Current Streak</h3>
                <div className="value">3 <span style={{fontSize: '1rem', color: 'var(--text-muted)'}}>weeks</span></div>
              </div>
            </div>

            <div className="glass-panel">
              <h2 style={{ marginBottom: '1rem' }}>Recent Workouts</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: 'var(--glass-border)', paddingBottom: '0.5rem' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>Upper Body Power</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Yesterday • 1h 15m</div>
                  </div>
                  <div style={{ color: 'var(--accent-orange)' }}>6,200 kg</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>Leg Day</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Tuesday • 1h 30m</div>
                  </div>
                  <div style={{ color: 'var(--accent-orange)' }}>8,450 kg</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logger' && (
          <div>
            <div className="header flex-between">
              <div>
                <h1>Current Session</h1>
                <p>Log your sets, reps, and weight.</p>
              </div>
              <button className="btn-neon">Finish Workout</button>
            </div>

            <div className="workout-logger">
              {workout.map((exercise, eIndex) => (
                <div key={exercise.id} className="glass-panel exercise-group">
                  <div className="exercise-header">
                    <h3>{exercise.name}</h3>
                    <button className="btn-icon">⚙️</button>
                  </div>
                  <table className="sets-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>Set</th>
                        <th>kg</th>
                        <th>Reps</th>
                        <th style={{ width: '40px' }}>✓</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exercise.sets.map((set, sIndex) => (
                        <tr key={sIndex}>
                          <td><span className="set-number">{sIndex + 1}</span></td>
                          <td>
                            <input 
                              type="number" 
                              className="input-glass" 
                              value={set.weight || ''} 
                              placeholder="0"
                              onChange={(e) => updateSet(eIndex, sIndex, 'weight', e.target.value)}
                            />
                          </td>
                          <td>
                            <input 
                              type="number" 
                              className="input-glass" 
                              value={set.reps || ''} 
                              placeholder="0"
                              onChange={(e) => updateSet(eIndex, sIndex, 'reps', e.target.value)}
                            />
                          </td>
                          <td>
                            <button className="btn-icon" style={{ background: 'rgba(32, 201, 151, 0.2)', color: 'var(--accent-green)' }}>✓</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button 
                    onClick={() => addSet(eIndex)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', marginTop: '1rem', cursor: 'pointer', fontSize: '0.875rem' }}
                  >
                    + Add Set
                  </button>
                </div>
              ))}
              
              <button className="add-exercise-btn" onClick={addExercise}>
                + Add Exercise
              </button>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            <div className="header">
              <h1>Workout History</h1>
              <p>Review your past sessions.</p>
            </div>
            <div className="glass-panel" style={{ marginBottom: '1rem' }}>
              <h3 style={{ color: 'var(--accent-orange)' }}>Upper Body Power</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>Yesterday • 1h 15m • 6,200 kg</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.875rem' }}>
                <div><strong>Bench Press:</strong> 4 sets</div>
                <div><strong>Incline Dumbbell:</strong> 3 sets</div>
                <div><strong>Pull-ups:</strong> 4 sets</div>
                <div><strong>Barbell Row:</strong> 3 sets</div>
              </div>
            </div>
            <div className="glass-panel">
              <h3 style={{ color: 'var(--accent-orange)' }}>Leg Day</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>Tuesday • 1h 30m • 8,450 kg</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.875rem' }}>
                <div><strong>Squat:</strong> 5 sets</div>
                <div><strong>Leg Press:</strong> 4 sets</div>
                <div><strong>Romanian Deadlift:</strong> 4 sets</div>
                <div><strong>Calf Raises:</strong> 5 sets</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'exercises' && (
          <div>
            <div className="header">
              <h1>Exercise Library</h1>
              <p>Browse or create custom exercises.</p>
            </div>
            <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '1rem', borderBottom: 'var(--glass-border)' }}>
                <input type="text" className="input-glass" placeholder="Search exercises..." style={{ width: '100%' }} />
              </div>
              <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="flex-between">
                  <div>
                    <div style={{ fontWeight: 600 }}>Bench Press (Barbell)</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Chest</div>
                  </div>
                  <button className="btn-icon">ℹ️</button>
                </div>
                <div className="flex-between">
                  <div>
                    <div style={{ fontWeight: 600 }}>Squat (Barbell)</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Legs</div>
                  </div>
                  <button className="btn-icon">ℹ️</button>
                </div>
                <div className="flex-between">
                  <div>
                    <div style={{ fontWeight: 600 }}>Deadlift (Barbell)</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Back / Legs</div>
                  </div>
                  <button className="btn-icon">ℹ️</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div>
            <div className="header flex-between">
              <div>
                <h1>Your Profile</h1>
                <p>Manage your stats and preferences.</p>
              </div>
              {/* Mobile logout button */}
              <button 
                className="btn-icon" 
                style={{ display: window.innerWidth <= 768 ? 'block' : 'none' }}
                onClick={() => setIsAuthenticated(false)}
              >
                🚪 Log out
              </button>
            </div>
            <div className="glass-panel">
              <form>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value="alex@example.com" readOnly />
                </div>
                <div className="form-group">
                  <label>Date of Birth</label>
                  <input type="date" defaultValue="1995-05-15" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Height (cm)</label>
                    <input type="number" defaultValue="180" />
                  </div>
                  <div className="form-group">
                    <label>Weight (kg)</label>
                    <input type="number" defaultValue="82" />
                  </div>
                </div>
                <button type="button" className="btn-neon" style={{ width: '100%' }}>Save Profile</button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Nav for Mobile */}
      <nav className="mobile-nav">
        {renderNavItems(true)}
      </nav>
    </div>
  )
}

export default App
