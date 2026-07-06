import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sidebar } from './Sidebar';

export function Layout() {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-bg">
      <Sidebar />
      {/* Área de conteúdo — compensa a sidebar fixa de 240px; em telas
          menores (tablet) a sidebar permanece, com conteúdo rolável */}
      <main className="ml-60 min-h-screen">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="mx-auto max-w-[1400px] p-5 lg:p-7"
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}
