import { ApplicationCommandOptionType, ApplicationCommandType } from 'discord-api-types/v10'
import {
  ChoiceField,
  CommandView,
  IntField,
  ListField,
  StringField,
  _,
} from '../../../discord-framework'

const experimental_command = new CommandView({
  type: ApplicationCommandType.ChatInput,

  custom_id_prefix: 'exp',

  command: {
    name: 'dev',
    description: 'experiments',
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: '',
        description: 'Refreshes something',
        options: [
          {
            type: ApplicationCommandOptionType.String,
            name: 'type',
            description: 'The type of refresh',
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.User,
        name: 'user',
        description: 'The user to test',
      },
    ],
  },

  state_schema: {
    clicked_btn: new ChoiceField({ wait: _, increment: _, one: _, two: _ }),
    counter: new IntField(),
    original_user: new StringField(),
    value: new ListField(),
  },
})
