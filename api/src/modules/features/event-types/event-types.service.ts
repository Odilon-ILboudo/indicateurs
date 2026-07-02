import { Injectable, NotFoundException, ConflictException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndicatorEventType } from './event-type.entity';

@Injectable()
export class EventTypesService implements OnModuleInit {
  private readonly logger = new Logger(EventTypesService.name);

  constructor(
    @InjectRepository(IndicatorEventType, 'indicators')
    private readonly repo: Repository<IndicatorEventType>,
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.repo.count();
    if (count === 0) {
      await this.repo.save({
        name: 'exercise.answered',
        label: 'Exercice répondu',
        description: "Déclenché quand un apprenant répond à un exercice (INSERT ou UPDATE de note dans SessionData).",
        isActive: true,
      });
      this.logger.log('Seed: événement "exercise.answered" créé');
    }
  }

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const evt = await this.repo.findOne({ where: { id } });
    if (!evt) throw new NotFoundException(`Événement ${id} introuvable`);
    return evt;
  }

  async create(dto: { name: string; label: string; description?: string }) {
    const exists = await this.repo.findOne({ where: { name: dto.name } });
    if (exists) throw new ConflictException(`L'événement "${dto.name}" existe déjà`);
    return this.repo.save({ ...dto, isActive: true });
  }

  async update(id: string, dto: Partial<{ name: string; label: string; description: string; isActive: boolean }>) {
    const evt = await this.findOne(id);
    Object.assign(evt, dto);
    return this.repo.save(evt);
  }

  async remove(id: string) {
    const evt = await this.findOne(id);
    await this.repo.remove(evt);
  }
}
