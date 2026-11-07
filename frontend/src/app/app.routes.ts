import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'cliente', children: [] },
  { path: 'asesor', children: [] },
  { path: '', redirectTo: 'cliente', pathMatch: 'full' },
];

