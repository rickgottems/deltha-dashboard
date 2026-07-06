import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { Layout } from './components/Layout';
import { Executivo } from './pages/Executivo';
import { Financeiro } from './pages/Financeiro';
import { Receitas } from './pages/Receitas';
import { Despesas } from './pages/Despesas';
import { Vendas } from './pages/Vendas';
import { Clientes } from './pages/Clientes';
import { Operacoes } from './pages/Operacoes';
import { Calendario } from './pages/Calendario';
import { Relatorios } from './pages/Relatorios';
import { Configuracoes } from './pages/Configuracoes';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          {/* Executivo é a tela padrão de entrada */}
          <Route index element={<Executivo />} />
          <Route path="financeiro" element={<Financeiro />} />
          <Route path="receitas" element={<Receitas />} />
          <Route path="despesas" element={<Despesas />} />
          <Route path="vendas" element={<Vendas />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="operacoes" element={<Operacoes />} />
          <Route path="calendario" element={<Calendario />} />
          <Route path="relatorios" element={<Relatorios />} />
          <Route path="configuracoes" element={<Configuracoes />} />
          <Route path="*" element={<Executivo />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
