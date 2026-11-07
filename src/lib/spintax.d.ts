export interface SpintaxValidation { valid: boolean; hasSpintax: boolean; combinations: number; error?: string }
export interface SpintaxPlanner { uniqueAvailable: number; next(key?: string): string }
export interface AutoSpinResult { source: string; changed: boolean; replacements: string[] }
export function validateSpintax(text: string): SpintaxValidation;
export function spintaxResolve(text: string, random?: () => number): string;
export function spintaxParse(text: string): unknown;
export function spintaxHasChoiceSyntax(text: string): boolean;
export function spintaxAutoSpin(text: string, maxTerms?: number, options?: { protectedWords?: string[] }): AutoSpinResult;
export function spintaxCreatePlanner(text: string, count?: number, options?: { excludeOriginal?: boolean }): SpintaxPlanner;
export function spintaxCreateAutoPlanner(text: string, count?: number): SpintaxPlanner;
