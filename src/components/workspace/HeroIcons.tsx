// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

'use client';

import React from 'react';
import { BlueprintIcon } from '@/src/components/ui/BlueprintIcon';

type IconProps = { className?: string };

export function CpuChipIcon({ className }: IconProps) {
  return <BlueprintIcon icon="hexagon" className={className} />;
}

export function UserIcon({ className }: IconProps) {
  return <BlueprintIcon icon="user" className={className} />;
}

export function ArrowDownLeftIcon({ className }: IconProps) {
  return <BlueprintIcon icon="arrow-bottom-left" className={className} />;
}

export function ArrowLeftCircleIcon({ className }: IconProps) {
  return <BlueprintIcon icon="git-merge" className={className} />;
}

export function ChevronLeftIcon({ className }: IconProps) {
  return <BlueprintIcon icon="chevron-left" className={className} />;
}

export function ChevronRightIcon({ className }: IconProps) {
  return <BlueprintIcon icon="chevron-right" className={className} />;
}

export function MenuIcon({ className }: IconProps) {
  return <BlueprintIcon icon="menu" className={className} />;
}

export function MenuClosedIcon({ className }: IconProps) {
  return <BlueprintIcon icon="menu-closed" className={className} />;
}

export function HomeIcon({ className }: IconProps) {
  return <BlueprintIcon icon="home" className={className} />;
}

export function QuestionMarkCircleIcon({ className }: IconProps) {
  return <BlueprintIcon icon="help" className={className} />;
}

export function ArrowUpIcon({ className }: IconProps) {
  return <BlueprintIcon icon="arrow-up" className={className} />;
}

export function ArrowUpRightIcon({ className }: IconProps) {
  return <BlueprintIcon icon="arrow-top-right" className={className} />;
}

export function XMarkIcon({ className }: IconProps) {
  return <BlueprintIcon icon="cross" className={className} />;
}

export function PaperClipIcon({ className }: IconProps) {
  return <BlueprintIcon icon="paperclip" className={className} />;
}

export function ArchiveBoxArrowDownIcon({ className }: IconProps) {
  return <BlueprintIcon icon="archive" className={className} />;
}

export function PencilIcon({ className }: IconProps) {
  return <BlueprintIcon icon="edit" className={className} />;
}

export function Square2StackIcon({ className }: IconProps) {
  return <BlueprintIcon icon="duplicate" className={className} />;
}

export function CheckIcon({ className }: IconProps) {
  return <BlueprintIcon icon="tick" className={className} />;
}

export function SearchIcon({ className }: IconProps) {
  return <BlueprintIcon icon="globe-network" className={className} />;
}

export function ConsoleIcon({ className }: IconProps) {
  return <BlueprintIcon icon="console" className={className} />;
}

export function PlusIcon({ className }: IconProps) {
  return <BlueprintIcon icon="folder-new" className={className} />;
}

export function SharedWorkspaceIcon({ className }: IconProps) {
  return <BlueprintIcon icon="share" className={className} />;
}
